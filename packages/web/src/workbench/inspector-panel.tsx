import { useEffect, useState, type ReactElement } from "react";

import {
  CommandFailure,
  type CommandClient,
  ConflictDialog,
  type ConflictField,
  type ObjectDetail,
  type ObjectType,
  type RelationSummary,
  updateSingleField,
  type UpdateSingleFieldResult,
  type ViewObject,
} from "@m-next/views";

import {
  fieldLabel as displayFieldLabel,
  objectDisplayTitle,
  safeVisibleText,
  statusLabel as dataStatusLabel,
} from "../display-labels";
import { useToast } from "../toast";
import { isDerivedField } from "./diagram-panel";
import { LineageView } from "./lineage-view";
import { ProvenancePassport, RuleLamp } from "./widgets";
import { useWorkbenchContext } from "./workbench";

/**
 * 保存 Inspector 字段:经唯一出口 updateSingleField 完成"按字段类型转换 + 提交"(数值→number,
 * 非法数字拦截提示「请输入数字」不提交)。409 冲突原样抛给 UI 打开冲突对话框。
 */
export async function saveInspectorField(
  commandClient: Pick<CommandClient, "updateFields">,
  workspaceId: string,
  object: ViewObject,
  fieldCode: string,
  draft: string,
  dataType: string | undefined,
): Promise<UpdateSingleFieldResult> {
  return updateSingleField(commandClient, {
    workspaceId,
    object,
    fieldCode,
    raw: draft,
    dataType,
  });
}

export interface InspectorConflictState {
  readonly currentVersion: number;
  readonly fields: readonly ConflictField[];
}

export function inspectorVersionConflict(
  error: unknown,
  fallbackVersion: number,
): InspectorConflictState | null {
  if (
    !(error instanceof CommandFailure) ||
    error.commandError.code !== "KERNEL-409-VERSION-CONFLICT"
  ) {
    return null;
  }
  return {
    currentVersion:
      error.commandError.details?.currentVersion ?? fallbackVersion,
    fields: error.commandError.details?.conflictingFields ?? [],
  };
}

export function ruleStatusText(object: ViewObject): string {
  if (object.ruleStatus === "OK") return "通过";
  if (object.ruleStatus === "WARN") return "告警";
  if (object.ruleStatus === "BLOCK") return "阻断";
  return "未知";
}

/** 对象来源 kind → 中文标签。未知/缺省回落到 "未知"。纯函数。 */
export function sourceLabel(source: string | null): string {
  switch (source) {
    case "manual":
      return "手填";
    case "import":
      return "导入";
    case "artifact_sync":
      return "工具同步";
    case "derived":
      return "派生";
    case "simulation":
      return "仿真";
    case "system":
      return "系统";
    default:
      return "未知";
  }
}

/** 新鲜度:把 ISO 时间转成相对描述。无法解析返回 "—"。纯函数,便于测试。 */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const minutes = Math.floor(Math.max(0, nowMs - then) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export type FieldEntry = readonly [string, unknown];

/** 把字段分成 派生(fx) 与 存储 两组。纯函数,谓词可注入,便于测试。 */
export function partitionFields(
  fields: Readonly<Record<string, unknown>>,
  isDerived: (code: string) => boolean = isDerivedField,
): {
  readonly derived: readonly FieldEntry[];
  readonly stored: readonly FieldEntry[];
} {
  const derived: FieldEntry[] = [];
  const stored: FieldEntry[] = [];
  for (const entry of Object.entries(fields)) {
    if (isDerived(entry[0])) derived.push(entry);
    else stored.push(entry);
  }
  return { derived, stored };
}

/**
 * 属性面板隐藏字段:body(正文)有文档视图专属富文本编辑区,属性面板不展示其原始 JSON。
 * 纯函数,便于测试。
 */
export function omitInspectorHiddenFields(
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([code]) => code !== "body"),
  );
}

/** 连线两端的可读标签:源 → 目标。纯函数。 */
export function relationEndpointsLabel(relation: RelationSummary): string {
  return relation.sourceId && relation.targetId ? "源对象 → 目标对象" : "未知";
}

export interface InspectorSavedCallbacks {
  readonly setMessage: (message: string) => void;
  readonly toastSuccess: (message: string) => void;
  readonly refreshSelected: () => void;
  readonly scheduleRefresh: (callback: () => void, delayMs: number) => void;
  readonly autoCheckAfterSave: () => Promise<void>;
}

export function handleInspectorFieldSaved(
  code: string,
  callbacks: InspectorSavedCallbacks,
): Promise<void> {
  const message = `${displayFieldLabel(code)} 已保存`;
  callbacks.setMessage(message);
  callbacks.toastSuccess(message);
  callbacks.refreshSelected();
  callbacks.scheduleRefresh(callbacks.refreshSelected, 800);
  return callbacks.autoCheckAfterSave();
}

const MUTED = { opacity: 0.65, fontSize: "0.85em" } as const;

export function InspectorPanel(): ReactElement {
  const context = useWorkbenchContext();
  const toast = useToast();
  const [detail, setDetail] = useState<ObjectDetail | null>(null);
  const [relationId, setRelationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lineageFieldCode, setLineageFieldCode] = useState<string | null>(null);
  const [objectTypes, setObjectTypes] = useState<readonly ObjectType[]>([]);

  // 字段类型定义:保存数值字段前用它把字符串转 number(见 FieldEditor / saveInspectorField)。
  useEffect(() => {
    let disposed = false;
    void context.viewClient
      .objectTypes(context.workspaceId)
      .then((types) => {
        if (!disposed) setObjectTypes(types);
      })
      .catch(() => {
        if (!disposed) setObjectTypes([]);
      });
    return () => {
      disposed = true;
    };
  }, [context.viewClient, context.workspaceId]);

  useEffect(
    () =>
      context.selection.subscribe((selected) => {
        if (selected?.entityType === "relation") {
          // 保留已加载的 detail,以便从其关系列表中解析这条连线
          setRelationId(selected.entityId);
          return;
        }
        setRelationId(null);
        if (
          selected?.entityType === "object" ||
          selected?.entityType === "field"
        ) {
          setLoading(true);
          void context.viewClient
            .object(context.workspaceId, selected.entityId)
            .then(setDetail)
            .catch(() => setDetail(null))
            .finally(() => setLoading(false));
        } else {
          setDetail(null);
        }
      }),
    [
      context.refreshVersion,
      context.selection,
      context.viewClient,
      context.workspaceId,
    ],
  );

  if (relationId) {
    const relation =
      detail?.relations.find((item) => item.relationId === relationId) ?? null;
    return (
      <EdgeInspector
        commandClient={context.commandClient}
        onBack={() => {
          setRelationId(null);
          if (relation) {
            context.selection.select({
              entityType: "object",
              entityId: relation.sourceId,
            });
          }
        }}
        onDeleted={() => {
          setRelationId(null);
          context.refreshViews();
          toast.success("连线已删除");
          if (relation) {
            context.selection.select({
              entityType: "object",
              entityId: relation.sourceId,
            });
          }
        }}
        relation={relation}
        reportError={context.reportError}
        workspaceId={context.workspaceId}
      />
    );
  }

  if (!detail) {
    return (
      <aside aria-label="属性/校验面板" className="inspector-panel">
        {loading ? "加载中…" : "请选择对象"}
      </aside>
    );
  }

  const object = detail.object;
  const fieldDataType = (code: string): string | undefined =>
    objectTypes
      .find((type) => type.code === object.objectType)
      ?.fields.find((field) => field.code === code)?.dataType;
  const fieldLabel = (code: string): string =>
    displayFieldLabel(
      code,
      objectTypes
        .find((type) => type.code === object.objectType)
        ?.fields.find((field) => field.code === code)?.name,
    );
  const { derived, stored } = partitionFields({
    ...omitInspectorHiddenFields(object.fields),
    ...(object.derived ?? {}),
  });
  // 保存后刷新:即时刷一次,再过一拍刷一次(等读库经投影追平,画布/派生自动跟上,免手动 F5)
  const refreshSelected = (): void => {
    context.refreshViews();
    void context.viewClient
      .object(context.workspaceId, object.objectId)
      .then(setDetail)
      .catch(() => {});
  };
  const onFieldSaved = (code: string): void => {
    void handleInspectorFieldSaved(code, {
      setMessage,
      toastSuccess: toast.success,
      refreshSelected,
      scheduleRefresh: (callback, delayMs) =>
        window.setTimeout(callback, delayMs),
      autoCheckAfterSave: context.autoCheckAfterSave,
    });
  };
  return (
    <aside aria-label="属性/校验面板" className="inspector-panel">
      <h2>{objectDisplayTitle(object)}</h2>
      <p className="inspector-passport">
        {dataStatusLabel(object.status)} · v{object.version}
      </p>
      <section aria-label="来源" className="inspector-section">
        <h3>来源 · 护照</h3>
        <ProvenancePassport
          downstream={detail.relations.length}
          freshness={relativeTime(object.updatedAt)}
          source={sourceLabel(object.source)}
        />
        <dl className="passport-grid">
          <div>
            <dt>来源</dt>
            <dd>
              <span
                className={`source-badge source-${object.source ?? "unknown"}`}
              >
                {sourceLabel(object.source)}
              </span>
            </dd>
          </div>
          <div>
            <dt>新鲜度</dt>
            <dd>{relativeTime(object.updatedAt)}</dd>
          </div>
          <div>
            <dt>下游</dt>
            <dd>↓{detail.relations.length}</dd>
          </div>
          <div>
            <dt>版本</dt>
            <dd>v{object.version}</dd>
          </div>
        </dl>
      </section>
      <section aria-label="规则态" className="inspector-section">
        <h3>校验</h3>
        <RuleLamp status={object.ruleStatus} />
      </section>
      <section aria-label="字段" className="inspector-section">
        <h3>字段</h3>
        {stored.length === 0 && derived.length === 0 ? <p>无字段</p> : null}
        {stored.length > 0 ? (
          <div aria-label="存储字段">
            <h4 style={MUTED}>存储</h4>
            {stored.map(([code, value]) => (
              <FieldEditor
                fieldCode={code}
                fieldLabel={fieldLabel(code)}
                key={code}
                object={object}
                onSaved={() => onFieldSaved(code)}
                reportError={context.reportError}
                value={value}
                workspaceId={context.workspaceId}
                commandClient={context.commandClient}
                dataType={fieldDataType(code)}
              />
            ))}
          </div>
        ) : null}
        {derived.length > 0 ? (
          <div aria-label="派生字段">
            <h4 style={MUTED}>派生 (fx · 后端实时)</h4>
            {derived.map(([code, value]) => (
              <div className="derived-field" key={code}>
                <FieldEditor
                  fieldCode={code}
                  fieldLabel={fieldLabel(code)}
                  object={object}
                  onSaved={() => onFieldSaved(code)}
                  reportError={context.reportError}
                  value={value}
                  workspaceId={context.workspaceId}
                  commandClient={context.commandClient}
                  dataType={fieldDataType(code)}
                />
                <button
                  className="field-lineage-toggle"
                  onClick={() => setLineageFieldCode(code)}
                  type="button"
                >
                  血缘
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section aria-label="关系" className="inspector-section">
        <h3>关系</h3>
        {detail.relations.length === 0 ? <p>无关系</p> : null}
        {detail.relations.map((relation) => (
          <button
            key={relation.relationId}
            onClick={() =>
              context.selection.select({
                entityType: "relation",
                entityId: relation.relationId,
              })
            }
            type="button"
          >
            {safeVisibleText(relation.relationType, "关系")}:{" "}
            {relationEndpointsLabel(relation)}
          </button>
        ))}
      </section>
      {message ? <p role="status">{message}</p> : null}
      {lineageFieldCode ? (
        <LineageView
          fieldCode={lineageFieldCode}
          object={object}
          onClose={() => setLineageFieldCode(null)}
          viewClient={context.viewClient}
          workspaceId={context.workspaceId}
        />
      ) : null}
    </aside>
  );
}

interface FieldEditorProps {
  readonly fieldCode: string;
  readonly fieldLabel: string;
  readonly value: unknown;
  readonly object: ViewObject;
  readonly workspaceId: string;
  readonly commandClient: Pick<CommandClient, "updateFields">;
  readonly dataType?: string;
  readonly onSaved: () => void;
  readonly reportError: (message: string) => void;
}

function FieldEditor({
  fieldCode,
  fieldLabel,
  value,
  object,
  workspaceId,
  commandClient,
  dataType,
  onSaved,
  reportError,
}: FieldEditorProps): ReactElement {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [conflict, setConflict] = useState<InspectorConflictState | null>(null);
  const derived = isDerivedField(fieldCode);

  useEffect(() => {
    setDraft(String(value ?? ""));
    setConflict(null);
  }, [value]);

  async function save(): Promise<void> {
    try {
      const result = await saveInspectorField(
        commandClient,
        workspaceId,
        object,
        fieldCode,
        draft,
        dataType,
      );
      if (result.kind === "invalid") {
        reportError(result.message);
        return;
      }
      setConflict(null);
      onSaved();
    } catch (error) {
      const nextConflict = inspectorVersionConflict(error, object.version);
      if (nextConflict) {
        setConflict(nextConflict);
        return;
      }
      reportError(error instanceof Error ? error.message : "字段保存失败");
    }
  }

  async function resolveConflict(
    choices: Readonly<Record<string, "mine" | "current">>,
  ): Promise<void> {
    if (!conflict) return;
    if (choices[fieldCode] !== "mine") {
      const current = conflict.fields.find(
        (item) => item.fieldDefCode === fieldCode,
      )?.currentValue;
      if (current !== undefined) setDraft(String(current ?? ""));
      setConflict(null);
      return;
    }
    try {
      const result = await saveInspectorField(
        commandClient,
        workspaceId,
        { ...object, version: conflict.currentVersion },
        fieldCode,
        draft,
        dataType,
      );
      if (result.kind === "invalid") {
        reportError(result.message);
        return;
      }
      setConflict(null);
      onSaved();
    } catch (error) {
      const nextConflict = inspectorVersionConflict(
        error,
        conflict.currentVersion,
      );
      if (nextConflict) {
        setConflict(nextConflict);
        return;
      }
      reportError(error instanceof Error ? error.message : "字段保存失败");
    }
  }

  return (
    <>
      <form
        className="field-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (!derived) void save();
        }}
      >
        <label>
          <span>
            {fieldLabel} {derived ? "fx" : "存储"}
          </span>
          <input
            disabled={derived}
            onBlur={() => {
              // 失焦自动保存:值变了就提交(派生字段只读、不存)
              if (!derived && draft !== String(value ?? "")) void save();
            }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            value={draft}
          />
        </label>
        <button
          disabled={derived || draft === String(value ?? "")}
          type="submit"
        >
          保存
        </button>
      </form>
      {conflict ? (
        <ConflictDialog
          fields={conflict.fields}
          onClose={() => setConflict(null)}
          onConfirm={(choices) => void resolveConflict(choices)}
        />
      ) : null}
    </>
  );
}

/**
 * 只读连线检查器:展示选中关系的类型与两端。改型/反转/删除需关系版本投影,
 * 读侧暂未提供,故本版只读(见 docs 计划)。关系若不在当前对象的关系列表中,
 * 仅显示其 id。
 */
function EdgeInspector({
  relation,
  workspaceId,
  commandClient,
  onBack,
  onDeleted,
  reportError,
}: {
  readonly relation: RelationSummary | null;
  readonly workspaceId: string;
  readonly commandClient: Pick<CommandClient, "unlink">;
  readonly onBack: () => void;
  readonly onDeleted: () => void;
  readonly reportError: (message: string) => void;
}): ReactElement {
  const [deleting, setDeleting] = useState(false);

  async function remove(): Promise<void> {
    if (!relation) return;
    setDeleting(true);
    try {
      await commandClient.unlink(
        workspaceId,
        relation.relationId,
        relation.version,
      );
      onDeleted();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "删除连线失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <aside aria-label="连线属性" className="inspector-panel">
      <div className="edge-inspector-head">
        <h2>连线属性</h2>
        <button onClick={onBack} type="button">
          返回图元
        </button>
      </div>
      {relation ? (
        <>
          <section aria-label="关系类型" className="inspector-section">
            <h3>关系类型</h3>
            <p>
              <span className="edge-kind">
                {safeVisibleText(relation.relationType, "关系")}
              </span>
            </p>
          </section>
          <section aria-label="两端" className="inspector-section">
            <h3>两端</h3>
            <p className="edge-endpoints">{relationEndpointsLabel(relation)}</p>
          </section>
          <section aria-label="操作" className="inspector-section">
            <button
              className="edge-delete"
              disabled={deleting}
              onClick={() => void remove()}
              type="button"
            >
              {deleting ? "删除中…" : "删除连线"}
            </button>
            <p className="edge-readonly-note">
              删除经命令入口、按关系版本乐观锁;改型 / 反转待后续。
            </p>
          </section>
        </>
      ) : (
        <section className="inspector-section">
          <p>已选连线。请先选中其一端的图元以查看类型、两端并删除。</p>
        </section>
      )}
    </aside>
  );
}
