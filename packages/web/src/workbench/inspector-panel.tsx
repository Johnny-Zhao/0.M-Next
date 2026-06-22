import { useEffect, useState, type ReactElement } from "react";

import type { CommandClient, ObjectDetail, ViewObject } from "@m-next/views";

import { isDerivedField } from "./diagram-panel";
import { useWorkbenchContext } from "./workbench";

export function coerceEditedValue(
  value: string,
  currentValue: unknown,
): unknown {
  if (typeof currentValue === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : currentValue;
  }
  if (typeof currentValue === "boolean") return value === "true";
  return value;
}

export async function saveDrivingField(
  commandClient: Pick<CommandClient, "updateFields">,
  workspaceId: string,
  object: ViewObject,
  fieldCode: string,
  value: unknown,
): Promise<void> {
  await commandClient.updateFields(
    workspaceId,
    object.objectId,
    object.version,
    [
      {
        fieldDefCode: fieldCode,
        value,
        expectedFieldVersion: object.version,
      },
    ],
  );
}

export function ruleStatusText(object: ViewObject): string {
  return object.ruleStatus;
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

const MUTED = { opacity: 0.65, fontSize: "0.85em" } as const;

export function InspectorPanel(): ReactElement {
  const context = useWorkbenchContext();
  const [detail, setDetail] = useState<ObjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(
    () =>
      context.selection.subscribe((selected) => {
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

  if (!detail) {
    return (
      <aside aria-label="属性/校验面板" className="inspector-panel">
        {loading ? "加载中…" : "请选择对象"}
      </aside>
    );
  }

  const object = detail.object;
  const { derived, stored } = partitionFields(object.fields);
  return (
    <aside aria-label="属性/校验面板" className="inspector-panel">
      <h2>{String(object.fields.name ?? object.objectId)}</h2>
      <p className="inspector-passport">
        {object.status} · v{object.version}
      </p>
      <section aria-label="规则态" className="inspector-section">
        <h3>校验</h3>
        <p>{ruleStatusText(object)}</p>
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
                key={code}
                object={object}
                onSaved={() => {
                  setMessage(`${code} 已保存`);
                  context.refreshViews();
                }}
                reportError={context.reportError}
                value={value}
                workspaceId={context.workspaceId}
                commandClient={context.commandClient}
              />
            ))}
          </div>
        ) : null}
        {derived.length > 0 ? (
          <div aria-label="派生字段">
            <h4 style={MUTED}>派生 (fx · 后端实时)</h4>
            {derived.map(([code, value]) => (
              <FieldEditor
                fieldCode={code}
                key={code}
                object={object}
                onSaved={() => {
                  setMessage(`${code} 已保存`);
                  context.refreshViews();
                }}
                reportError={context.reportError}
                value={value}
                workspaceId={context.workspaceId}
                commandClient={context.commandClient}
              />
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
            {relation.relationType}: {relation.sourceId} → {relation.targetId}
          </button>
        ))}
      </section>
      {message ? <p role="status">{message}</p> : null}
    </aside>
  );
}

interface FieldEditorProps {
  readonly fieldCode: string;
  readonly value: unknown;
  readonly object: ViewObject;
  readonly workspaceId: string;
  readonly commandClient: Pick<CommandClient, "updateFields">;
  readonly onSaved: () => void;
  readonly reportError: (message: string) => void;
}

function FieldEditor({
  fieldCode,
  value,
  object,
  workspaceId,
  commandClient,
  onSaved,
  reportError,
}: FieldEditorProps): ReactElement {
  const [draft, setDraft] = useState(String(value ?? ""));
  const derived = isDerivedField(fieldCode);

  useEffect(() => setDraft(String(value ?? "")), [value]);

  async function save(): Promise<void> {
    try {
      await saveDrivingField(
        commandClient,
        workspaceId,
        object,
        fieldCode,
        coerceEditedValue(draft, value),
      );
      onSaved();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "字段保存失败");
    }
  }

  return (
    <form
      className="field-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (!derived) void save();
      }}
    >
      <label>
        <span>
          {fieldCode} {derived ? "fx" : "存储"}
        </span>
        <input
          disabled={derived}
          onChange={(event) => setDraft(event.currentTarget.value)}
          value={draft}
        />
      </label>
      <button disabled={derived || draft === String(value ?? "")} type="submit">
        保存
      </button>
    </form>
  );
}
