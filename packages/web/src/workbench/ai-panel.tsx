import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";

import type {
  AiChangeItem,
  AiChangeSet,
  SelectionRef,
  ViewObject,
} from "@m-next/views";

import { objectTypeLabel, safeVisibleText } from "../display-labels";
import { useToast } from "../toast";
import { useWorkbenchContext } from "./workbench";

interface DisplayChange {
  readonly itemId: string;
  readonly objectId: string;
  readonly fieldCode: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly verdict: string;
  readonly status: string;
}

interface ObjectSnapshot {
  readonly objectId: string;
  readonly label: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export function aiChangeSetId(result: {
  readonly events?: readonly string[];
}): string | null {
  return result.events?.[0] ?? null;
}

export function objectLabel(object: ViewObject): string {
  return safeVisibleText(
    String(
      object.fields.name ?? object.fields.title ?? object.fields.code ?? "",
    ),
    objectTypeLabel(object.objectType),
  );
}

function aiVerdictLabel(verdict: string): string {
  const normalized = verdict.toLowerCase();
  if (normalized === "accept") return "建议采用";
  if (normalized === "reject") return "建议拒绝";
  if (normalized === "needs_review") return "待复核";
  return "待确认";
}

export function aiItemChanges(
  item: AiChangeItem,
  snapshots: ReadonlyMap<string, ObjectSnapshot>,
): readonly DisplayChange[] {
  if (item.opType !== "UpdateFields") return [];
  const objectId = stringValue(item.payload.objectId);
  const fields = Array.isArray(item.payload.fields) ? item.payload.fields : [];
  return fields.flatMap((field) => {
    if (!isRecord(field)) return [];
    const fieldCode = stringValue(field.fieldDefCode);
    if (!objectId || !fieldCode) return [];
    return [
      {
        itemId: item.itemId,
        objectId,
        fieldCode,
        before: snapshots.get(objectId)?.fields[fieldCode] ?? null,
        after: field.value,
        verdict: stringValue(item.precheck.verdict) || "UNKNOWN",
        status: item.itemStatus,
      },
    ];
  });
}

export function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "空";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function aiVerdictTone(verdict: string): string {
  if (verdict === "WRITABLE") return "ok";
  if (verdict === "WARN") return "warn";
  if (verdict === "BLOCKED") return "block";
  return "unknown";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function AiPanel(): ReactElement {
  const context = useWorkbenchContext();
  const toast = useToast();
  const [selected, setSelected] = useState<SelectionRef | null>(
    context.selection.current(),
  );
  const [instruction, setInstruction] = useState("补齐缺失必填字段");
  const [busy, setBusy] = useState(false);
  const [sets, setSets] = useState<readonly AiChangeSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<
    ReadonlyMap<string, ObjectSnapshot>
  >(() => new Map());

  const loadSnapshots = useCallback(
    async (values: readonly AiChangeSet[]): Promise<void> => {
      const objectIds = new Set<string>();
      for (const set of values) {
        for (const item of set.items) {
          const objectId = stringValue(item.payload.objectId);
          if (objectId) objectIds.add(objectId);
        }
      }
      const entries = await Promise.all(
        [...objectIds].map(async (objectId) => {
          const detail = await context.viewClient.object(
            context.workspaceId,
            objectId,
          );
          return [
            objectId,
            {
              objectId,
              label: objectLabel(detail.object),
              fields: detail.object.fields,
            },
          ] as const;
        }),
      );
      setSnapshots(new Map(entries));
    },
    [context.viewClient, context.workspaceId],
  );

  const loadProposals = useCallback(
    async (setId?: string): Promise<void> => {
      const loaded = await context.viewClient.aiChanges(
        context.workspaceId,
        context.actorId,
        {
          status: setId ? undefined : "PROPOSED",
          setId,
        },
      );
      setSets(loaded);
      setActiveSetId(setId ?? loaded[0]?.setId ?? null);
      await loadSnapshots(loaded);
    },
    [context.actorId, context.viewClient, context.workspaceId, loadSnapshots],
  );

  useEffect(
    () => context.selection.subscribe(setSelected),
    [context.selection],
  );

  useEffect(() => {
    void loadProposals();
  }, [
    context.actorId,
    context.refreshVersion,
    context.viewClient,
    context.workspaceId,
    loadProposals,
  ]);

  const activeSet = useMemo(
    () => sets.find((set) => set.setId === activeSetId) ?? sets[0] ?? null,
    [activeSetId, sets],
  );
  const changes = useMemo(
    () =>
      activeSet?.items.flatMap((item) => aiItemChanges(item, snapshots)) ?? [],
    [activeSet, snapshots],
  );

  async function proposeForSelected(): Promise<void> {
    const objectId =
      selected?.entityType === "object" ? selected.entityId : null;
    if (!objectId) {
      toast.info("请先选中一个对象");
      return;
    }
    await propose([objectId]);
  }

  async function proposeForObjectType(): Promise<void> {
    const page = await context.viewClient.objects(
      context.workspaceId,
      context.objectType,
      0,
      20,
    );
    await propose(page.items.map((object) => object.objectId));
  }

  async function propose(objectIds: readonly string[]): Promise<void> {
    if (objectIds.length === 0) {
      toast.info("当前范围没有对象");
      return;
    }
    setBusy(true);
    try {
      const result = await context.commandClient.proposeAiChange(
        context.workspaceId,
        {
          action: "SUGGEST_FIELDS",
          selection: { objectIds, checkResultIds: [] },
          instruction,
        },
      );
      const setId = aiChangeSetId(result);
      if (setId) await loadProposals(setId);
      toast.success("AI 提议已生成,等待人工确认");
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "AI 提议失败",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(setId: string): Promise<void> {
    setBusy(true);
    try {
      await context.commandClient.confirmAiChange(context.workspaceId, setId);
      toast.success("AI 变更已确认写入");
      context.refreshViews();
      await loadProposals();
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "确认 AI 变更失败",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reject(setId: string): Promise<void> {
    setBusy(true);
    try {
      await context.commandClient.rejectAiChange(context.workspaceId, setId);
      toast.success("AI 提议已否决");
      await loadProposals();
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "否决 AI 变更失败",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-label="AI 助手" className="ai-panel">
      <section className="ai-panel-controls">
        <label>
          <span>指令</span>
          <textarea
            onChange={(event) => setInstruction(event.currentTarget.value)}
            value={instruction}
          />
        </label>
        <div className="ai-panel-actions">
          <button
            disabled={busy}
            onClick={() => void proposeForSelected()}
            type="button"
          >
            让 AI 提议当前对象
          </button>
          <button
            disabled={busy}
            onClick={() => void proposeForObjectType()}
            type="button"
          >
            提议当前类型首批对象
          </button>
        </div>
        <p>
          AI 只生成待确认变更集;确认后经 RBAC、命令治理与 CQRS
          写入。context_hash 可用于复核。
        </p>
      </section>
      <AiChangeSetList
        activeSet={activeSet}
        busy={busy}
        changes={changes}
        onConfirm={(setId) => void confirm(setId)}
        onReject={(setId) => void reject(setId)}
        onSelectObject={(objectId) =>
          context.selection.select({ entityType: "object", entityId: objectId })
        }
        snapshots={snapshots}
      />
    </aside>
  );
}

function AiChangeSetList(props: {
  readonly activeSet: AiChangeSet | null;
  readonly busy: boolean;
  readonly changes: readonly DisplayChange[];
  readonly snapshots: ReadonlyMap<string, ObjectSnapshot>;
  readonly onConfirm: (setId: string) => void;
  readonly onReject: (setId: string) => void;
  readonly onSelectObject: (objectId: string) => void;
}): ReactElement {
  if (!props.activeSet) {
    return <p className="view-empty-state">暂无待确认 AI 提议。</p>;
  }
  const activeSet = props.activeSet;
  return (
    <section className="ai-change-set">
      <header>
        <div>
          <strong>AI 提议 · 待确认</strong>
          <span>
            {activeSet.provider}@{activeSet.providerVersion}
          </span>
        </div>
        <code>{activeSet.contextHash}</code>
      </header>
      {activeSet.resultText ? (
        <pre className="ai-result-text">{activeSet.resultText}</pre>
      ) : null}
      <div className="ai-change-list">
        {props.changes.length === 0 ? (
          <p className="view-empty-state">该提议没有可写变更项。</p>
        ) : null}
        {props.changes.map((change) => (
          <button
            className={`ai-change-item ai-change-${aiVerdictTone(change.verdict)}`}
            key={`${change.itemId}-${change.fieldCode}`}
            onClick={() => props.onSelectObject(change.objectId)}
            type="button"
          >
            <span>{props.snapshots.get(change.objectId)?.label ?? "对象"}</span>
            <b>字段</b>
            <small>
              {valueText(change.before)} → {valueText(change.after)}
            </small>
            <i>{aiVerdictLabel(change.verdict)}</i>
          </button>
        ))}
      </div>
      <footer>
        <button
          disabled={props.busy || activeSet.status !== "PROPOSED"}
          onClick={() => props.onConfirm(activeSet.setId)}
          type="button"
        >
          确认写入
        </button>
        <button
          disabled={props.busy || activeSet.status !== "PROPOSED"}
          onClick={() => props.onReject(activeSet.setId)}
          type="button"
        >
          否决提议
        </button>
      </footer>
    </section>
  );
}
