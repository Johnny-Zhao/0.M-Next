import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";

import type {
  ExchangeChangedObject,
  ExchangeChangedRelation,
  ExchangeDiffResult,
  SnapshotMeta,
} from "@m-next/views";

import { useToast } from "../toast";
import { useWorkbenchContext } from "./workbench";

type CompareMode = "snapshot-current" | "snapshot-snapshot";

export function snapshotTitle(snapshot: SnapshotMeta): string {
  return `${new Date(snapshot.createdAt).toLocaleString()} · v${snapshot.dataVersion}`;
}

export function snapshotDiffSummaryItems(
  diff: ExchangeDiffResult | null,
  reversed: boolean,
): readonly {
  readonly label: string;
  readonly value: number;
  readonly tone: string;
}[] {
  if (!diff) return [];
  const summary = diff.summary;
  return [
    {
      label: "对象新增",
      value: reversed ? summary.objectsRemoved : summary.objectsAdded,
      tone: "add",
    },
    { label: "对象变更", value: summary.objectsChanged, tone: "change" },
    {
      label: "对象删除",
      value: reversed ? summary.objectsAdded : summary.objectsRemoved,
      tone: "remove",
    },
    {
      label: "关系新增",
      value: reversed ? summary.relationsRemoved : summary.relationsAdded,
      tone: "add",
    },
    { label: "关系变更", value: summary.relationsChanged, tone: "change" },
    {
      label: "关系删除",
      value: reversed ? summary.relationsAdded : summary.relationsRemoved,
      tone: "remove",
    },
  ];
}

export function SnapshotPanel(): ReactElement {
  const {
    actorId,
    objectType,
    reportError,
    selection,
    viewClient,
    workspaceId,
  } = useWorkbenchContext();
  const toast = useToast();
  const [snapshots, setSnapshots] = useState<readonly SnapshotMeta[]>([]);
  const [mode, setMode] = useState<CompareMode>("snapshot-current");
  const [scope, setScope] = useState(objectType);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [diff, setDiff] = useState<ExchangeDiffResult | null>(null);
  const [reversed, setReversed] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadSnapshots = useCallback(async (): Promise<void> => {
    const page = await viewClient.listSnapshots(workspaceId, actorId, 0, 50);
    setSnapshots(page.items);
    setLeftId((value) => value || page.items[0]?.snapshotId || "");
    setRightId((value) => value || page.items[1]?.snapshotId || "");
  }, [actorId, viewClient, workspaceId]);

  useEffect(() => {
    void loadSnapshots().catch((error) =>
      reportError(error instanceof Error ? error.message : "读取快照失败"),
    );
  }, [loadSnapshots, reportError]);

  const summary = useMemo(
    () => snapshotDiffSummaryItems(diff, reversed),
    [diff, reversed],
  );

  async function capture(): Promise<void> {
    setBusy(true);
    try {
      const created = await viewClient.captureSnapshot(
        workspaceId,
        actorId,
        scope.trim() || null,
      );
      toast.success(`已抓取快照 v${created.dataVersion}`);
      await loadSnapshots();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "抓取快照失败");
    } finally {
      setBusy(false);
    }
  }

  async function compare(): Promise<void> {
    if (!leftId) {
      toast.info("请选择快照");
      return;
    }
    setBusy(true);
    setDiff(null);
    try {
      if (mode === "snapshot-current") {
        const snapshot = await viewClient.getSnapshot(
          workspaceId,
          actorId,
          leftId,
        );
        const next = await viewClient.diff(workspaceId, {
          base: "current",
          other: snapshot.payload,
        });
        setReversed(true);
        setDiff(next);
      } else {
        if (!rightId || rightId === leftId) {
          toast.info("请选择两个不同快照");
          return;
        }
        const [left, right] = await Promise.all([
          viewClient.getSnapshot(workspaceId, actorId, leftId),
          viewClient.getSnapshot(workspaceId, actorId, rightId),
        ]);
        setReversed(false);
        setDiff(
          await viewClient.diff(workspaceId, {
            a: left.payload,
            b: right.payload,
          }),
        );
      }
    } catch (error) {
      reportError(error instanceof Error ? error.message : "快照对比失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-label="快照与对比" className="snapshot-panel">
      <section className="snapshot-card">
        <header>
          <div>
            <strong>快照</strong>
            <span>{snapshots.length} 个历史点</span>
          </div>
          <button disabled={busy} onClick={() => void capture()} type="button">
            抓快照
          </button>
        </header>
        <div className="snapshot-controls">
          <label>
            范围
            <input
              onChange={(event) => setScope(event.currentTarget.value)}
              value={scope}
            />
          </label>
          <label>
            对比
            <select
              onChange={(event) => {
                setMode(event.currentTarget.value as CompareMode);
                setDiff(null);
              }}
              value={mode}
            >
              <option value="snapshot-current">快照 → 当前</option>
              <option value="snapshot-snapshot">快照 A → 快照 B</option>
            </select>
          </label>
          <label>
            快照 A
            <SnapshotSelect
              onChange={setLeftId}
              snapshots={snapshots}
              value={leftId}
            />
          </label>
          {mode === "snapshot-snapshot" ? (
            <label>
              快照 B
              <SnapshotSelect
                onChange={setRightId}
                snapshots={snapshots}
                value={rightId}
              />
            </label>
          ) : null}
        </div>
        <footer>
          <button
            disabled={busy || !leftId}
            onClick={() => void compare()}
            type="button"
          >
            对比
          </button>
        </footer>
      </section>
      <SnapshotList snapshots={snapshots} />
      <SnapshotDiff
        diff={diff}
        onSelectObject={(objectId) =>
          selection.select({ entityType: "object", entityId: objectId })
        }
        reversed={reversed}
        summary={summary}
      />
    </aside>
  );
}

function SnapshotSelect({
  onChange,
  snapshots,
  value,
}: {
  readonly onChange: (value: string) => void;
  readonly snapshots: readonly SnapshotMeta[];
  readonly value: string;
}): ReactElement {
  return (
    <select
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    >
      <option value="">未选择</option>
      {snapshots.map((snapshot) => (
        <option key={snapshot.snapshotId} value={snapshot.snapshotId}>
          {snapshotTitle(snapshot)}
        </option>
      ))}
    </select>
  );
}

function SnapshotList({
  snapshots,
}: {
  readonly snapshots: readonly SnapshotMeta[];
}): ReactElement {
  if (snapshots.length === 0) {
    return <p className="view-empty-state">暂无快照。</p>;
  }
  return (
    <section className="snapshot-list">
      {snapshots.map((snapshot) => (
        <article key={snapshot.snapshotId}>
          <strong>{snapshotTitle(snapshot)}</strong>
          <span>{snapshot.createdBy}</span>
          <code>{snapshot.contentHash}</code>
          {snapshot.scopeObjectType ? (
            <small>{snapshot.scopeObjectType}</small>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function SnapshotDiff({
  diff,
  onSelectObject,
  reversed,
  summary,
}: {
  readonly diff: ExchangeDiffResult | null;
  readonly onSelectObject: (objectId: string) => void;
  readonly reversed: boolean;
  readonly summary: readonly {
    readonly label: string;
    readonly value: number;
    readonly tone: string;
  }[];
}): ReactElement {
  if (!diff) return <p className="view-empty-state">暂无对比结果。</p>;
  const objectsAdded = reversed ? diff.objects.removed : diff.objects.added;
  const objectsRemoved = reversed ? diff.objects.added : diff.objects.removed;
  const relationsAdded = reversed
    ? diff.relations.removed
    : diff.relations.added;
  const relationsRemoved = reversed
    ? diff.relations.added
    : diff.relations.removed;
  return (
    <section className="snapshot-diff">
      <div className="snapshot-summary-grid">
        {summary.map((item) => (
          <span
            className={`snapshot-summary snapshot-${item.tone}`}
            key={item.label}
          >
            <b>{item.value}</b>
            {item.label}
          </span>
        ))}
      </div>
      <div className="snapshot-diff-groups">
        <IdList
          onSelect={onSelectObject}
          title="新增对象"
          tone="add"
          values={objectsAdded}
        />
        <ChangedObjects
          onSelect={onSelectObject}
          reversed={reversed}
          values={diff.objects.changed}
        />
        <IdList
          onSelect={onSelectObject}
          title="删除对象"
          tone="remove"
          values={objectsRemoved}
        />
        <IdList title="新增关系" tone="add" values={relationsAdded} />
        <ChangedRelations reversed={reversed} values={diff.relations.changed} />
        <IdList title="删除关系" tone="remove" values={relationsRemoved} />
      </div>
    </section>
  );
}

function IdList({
  onSelect,
  title,
  tone,
  values,
}: {
  readonly onSelect?: (value: string) => void;
  readonly title: string;
  readonly tone: string;
  readonly values: readonly string[];
}): ReactElement | null {
  if (values.length === 0) return null;
  return (
    <section className={`snapshot-diff-group snapshot-group-${tone}`}>
      <h3>{title}</h3>
      {values.map((value) =>
        onSelect ? (
          <button key={value} onClick={() => onSelect(value)} type="button">
            {value}
          </button>
        ) : (
          <code key={value}>{value}</code>
        ),
      )}
    </section>
  );
}

function ChangedObjects({
  onSelect,
  reversed,
  values,
}: {
  readonly onSelect: (objectId: string) => void;
  readonly reversed: boolean;
  readonly values: readonly ExchangeChangedObject[];
}): ReactElement | null {
  if (values.length === 0) return null;
  return (
    <section className="snapshot-diff-group snapshot-group-change">
      <h3>修改对象</h3>
      {values.map((value) => (
        <article key={value.objectId}>
          <button onClick={() => onSelect(value.objectId)} type="button">
            {value.objectId}
          </button>
          <FieldChanges fields={value.fields} reversed={reversed} />
        </article>
      ))}
    </section>
  );
}

function ChangedRelations({
  reversed,
  values,
}: {
  readonly reversed: boolean;
  readonly values: readonly ExchangeChangedRelation[];
}): ReactElement | null {
  if (values.length === 0) return null;
  return (
    <section className="snapshot-diff-group snapshot-group-change">
      <h3>修改关系</h3>
      {values.map((value) => (
        <article key={value.relationId}>
          <strong>{value.relationId}</strong>
          <FieldChanges fields={value.fields} reversed={reversed} />
        </article>
      ))}
    </section>
  );
}

function FieldChanges({
  fields,
  reversed,
}: {
  readonly fields: ExchangeChangedObject["fields"];
  readonly reversed: boolean;
}): ReactElement {
  const added = Object.entries(reversed ? fields.removed : fields.added);
  const removed = Object.entries(reversed ? fields.added : fields.removed);
  const changed = Object.entries(fields.changed);
  return (
    <ul>
      {changed.map(([code, change]) => (
        <li key={code}>
          {code}: {valueText(reversed ? change.to : change.from)} →{" "}
          {valueText(reversed ? change.from : change.to)}
        </li>
      ))}
      {added.map(([code, value]) => (
        <li key={code}>
          {code}: 新增 {valueText(value)}
        </li>
      ))}
      {removed.map(([code, value]) => (
        <li key={code}>
          {code}: 删除 {valueText(value)}
        </li>
      ))}
    </ul>
  );
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "空";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
