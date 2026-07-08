import {
  CommandFailure,
  ConflictDialog,
  updateSingleField,
  type CommandClient,
  type ConflictField,
  type FieldDefinition,
  type ObjectType,
  type ViewObject,
} from "@m-next/views";
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import {
  fieldLabel,
  objectDisplayTitle,
  objectTypeLabel,
  statusLabel,
} from "../display-labels";
import { isDerivedField, objectCode } from "./diagram-panel";
import { relativeTime, sourceLabel } from "./inspector-panel";
import { FxChip, ProvenancePassport, RuleLamp } from "./widgets";
import { useWorkbenchContext } from "./workbench";

const fieldSummaryPageSize = 200;
const technicalTypeOrder = [
  "proposal",
  "system",
  "module",
  "interface",
  "requirement",
  "alternative",
] as const;
const summaryHiddenFieldCodes = new Set(["name", "title", "code", "body"]);

export interface FieldSummaryRow {
  readonly object: ViewObject;
  readonly type: ObjectType;
}

export interface FieldSummaryData {
  readonly types: readonly ObjectType[];
  readonly rows: readonly FieldSummaryRow[];
}

interface FieldSummaryViewClient {
  objectTypes(workspaceId: string): Promise<readonly ObjectType[]>;
  objects(
    workspaceId: string,
    objectType: string,
    page: number,
    pageSize: number,
  ): Promise<{
    readonly items: readonly ViewObject[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  }>;
}

export async function loadFieldSummaryData(
  viewClient: FieldSummaryViewClient,
  workspaceId: string,
): Promise<FieldSummaryData> {
  const types = sortFieldSummaryTypes(
    (await viewClient.objectTypes(workspaceId)).filter(
      (type) => type.fields.length > 0,
    ),
  );
  const objectsByType = await Promise.all(
    types.map((type) => loadObjectsForType(viewClient, workspaceId, type.code)),
  );
  return {
    types,
    rows: objectsByType.flatMap((objects, index) =>
      objects.map((object) => ({ object, type: types[index] })),
    ),
  };
}

async function loadObjectsForType(
  viewClient: FieldSummaryViewClient,
  workspaceId: string,
  objectType: string,
): Promise<readonly ViewObject[]> {
  const items: ViewObject[] = [];
  let pageNumber = 0;
  for (;;) {
    const page = await viewClient.objects(
      workspaceId,
      objectType,
      pageNumber,
      fieldSummaryPageSize,
    );
    items.push(...page.items);
    if ((page.page + 1) * page.pageSize >= page.total) return items;
    pageNumber += 1;
  }
}

export function fieldSummaryFields(
  row: FieldSummaryRow,
): readonly FieldDefinition[] {
  return row.type.fields.filter(
    (field) =>
      !summaryHiddenFieldCodes.has(field.code) && !isDerivedField(field.code),
  );
}

export function fieldSummaryDerivedEntries(
  object: ViewObject,
): readonly (readonly [string, unknown])[] {
  const entries = [
    ...Object.entries(object.derived ?? {}),
    ...Object.entries(object.fields).filter(([code]) => isDerivedField(code)),
  ];
  const used = new Set<string>();
  return entries.filter(([code, value]) => {
    if (used.has(code) || value === undefined || value === null) return false;
    used.add(code);
    return String(value).trim() !== "";
  });
}

export function fieldSummarySelectedClass(
  selectedId: string | null,
  objectId: string,
): string {
  return selectedId === objectId ? "field-summary-row-selected" : "";
}

export function fieldSummaryInputReadOnly(object: ViewObject): boolean {
  return isRetiredStatus(object.status);
}

export async function saveFieldSummaryField(
  commandClient: Pick<CommandClient, "updateFields">,
  workspaceId: string,
  object: ViewObject,
  field: FieldDefinition,
  raw: string,
): Promise<
  | { readonly kind: "saved"; readonly object: ViewObject }
  | { readonly kind: "invalid"; readonly message: string }
> {
  const result = await updateSingleField(commandClient, {
    workspaceId,
    object,
    fieldCode: field.code,
    raw,
    dataType: field.dataType,
  });
  if (result.kind === "invalid") return result;
  return {
    kind: "saved",
    object: {
      ...object,
      version: object.version + 1,
      fields: { ...object.fields, [field.code]: result.value },
    },
  };
}

function sortFieldSummaryTypes(
  types: readonly ObjectType[],
): readonly ObjectType[] {
  return [...types].sort((left, right) => {
    const leftRank = typeRank(left.code);
    const rightRank = typeRank(right.code);
    return leftRank === rightRank
      ? left.code.localeCompare(right.code)
      : leftRank - rightRank;
  });
}

function typeRank(code: string): number {
  const index = technicalTypeOrder.indexOf(
    code as (typeof technicalTypeOrder)[number],
  );
  return index >= 0 ? index : technicalTypeOrder.length;
}

interface ConflictState {
  readonly row: ViewObject;
  readonly field: FieldDefinition;
  readonly value: string;
  readonly currentVersion: number;
  readonly fields: readonly ConflictField[];
}

export function FieldSummaryPanel(): ReactElement {
  const context = useWorkbenchContext();
  const {
    autoCheckAfterSave,
    commandClient,
    refreshVersion,
    refreshViews,
    reportError,
    selection,
    viewClient,
    workspaceId,
  } = context;
  const [data, setData] = useState<FieldSummaryData>({ types: [], rows: [] });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    void loadFieldSummaryData(viewClient, workspaceId)
      .then((next) => {
        if (!disposed) setData(next);
      })
      .catch((error) => {
        if (!disposed) {
          setData({ types: [], rows: [] });
          reportError(
            error instanceof Error ? error.message : "字段总表加载失败",
          );
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [refreshVersion, reportError, viewClient, workspaceId]);

  useEffect(
    () =>
      selection.subscribe((selected) => {
        setSelectedId(
          selected?.entityType === "object" || selected?.entityType === "field"
            ? selected.entityId
            : null,
        );
      }),
    [selection],
  );

  const rowCountText = useMemo(
    () => `${data.rows.length} 个对象 · ${data.types.length} 类`,
    [data.rows.length, data.types.length],
  );

  async function saveField(
    row: ViewObject,
    field: FieldDefinition,
    value: string,
  ): Promise<void> {
    const result = await saveFieldSummaryField(
      commandClient,
      workspaceId,
      row,
      field,
      value,
    );
    if (result.kind === "invalid") {
      reportError(result.message);
      return;
    }
    setData((current) =>
      replaceSummaryObject(current, row.objectId, {
        ...result.object,
      }),
    );
    refreshViews();
    void autoCheckAfterSave();
  }

  function handleSaveFailure(
    row: ViewObject,
    field: FieldDefinition,
    value: string,
    error: unknown,
  ): void {
    if (
      error instanceof CommandFailure &&
      error.commandError.code === "KERNEL-409-VERSION-CONFLICT"
    ) {
      setConflict({
        row,
        field,
        value,
        currentVersion:
          error.commandError.details?.currentVersion ?? row.version,
        fields: error.commandError.details?.conflictingFields ?? [],
      });
      return;
    }
    reportError(error instanceof Error ? error.message : "保存失败");
  }

  function resolveConflict(
    choices: Readonly<Record<string, "mine" | "current">>,
  ): void {
    if (!conflict) return;
    const field = conflict.fields.find(
      (item) => item.fieldDefCode === conflict.field.code,
    );
    if (choices[conflict.field.code] === "mine") {
      void saveField(
        { ...conflict.row, version: conflict.currentVersion },
        conflict.field,
        conflict.value,
      ).catch((error) =>
        handleSaveFailure(conflict.row, conflict.field, conflict.value, error),
      );
    } else if (field) {
      setData((current) =>
        replaceSummaryObject(current, conflict.row.objectId, {
          ...conflict.row,
          version: conflict.currentVersion,
          fields: {
            ...conflict.row.fields,
            [field.fieldDefCode]: field.currentValue,
          },
        }),
      );
    }
    setConflict(null);
  }

  return (
    <section aria-label="字段总表" className="table-view field-summary-view">
      <header className="field-summary-header">
        <div>
          <h2>字段总表</h2>
          <p>本方案对象字段、派生值、校核与来源一屏总览</p>
        </div>
        <span>{loading ? "加载中…" : rowCountText}</span>
      </header>
      <div className="field-summary-scroll">
        <table className="table-grid field-summary-grid">
          <thead>
            <tr>
              <th>代号</th>
              <th>名称</th>
              <th>类型</th>
              <th>字段 · 存储值</th>
              <th>自动计算 (fx)</th>
              <th>检查</th>
              <th>来源 · 最近修改</th>
            </tr>
          </thead>
          <tbody>
            {!loading && data.rows.length === 0 ? (
              <tr>
                <td className="view-empty-state" colSpan={7}>
                  暂无字段数据
                </td>
              </tr>
            ) : null}
            {data.rows.map((row) => (
              <FieldSummaryTableRow
                key={row.object.objectId}
                onSaveFailure={handleSaveFailure}
                row={row}
                saveField={saveField}
                selectedClass={fieldSummarySelectedClass(
                  selectedId,
                  row.object.objectId,
                )}
                selection={selection}
              />
            ))}
          </tbody>
        </table>
      </div>
      {conflict && conflict.fields.length > 0 ? (
        <ConflictDialog
          fields={conflict.fields}
          onClose={() => setConflict(null)}
          onConfirm={resolveConflict}
        />
      ) : null}
    </section>
  );
}

function replaceSummaryObject(
  data: FieldSummaryData,
  objectId: string,
  object: ViewObject,
): FieldSummaryData {
  return {
    ...data,
    rows: data.rows.map((row) =>
      row.object.objectId === objectId ? { ...row, object } : row,
    ),
  };
}

function FieldSummaryTableRow({
  row,
  selectedClass,
  selection,
  saveField,
  onSaveFailure,
}: {
  readonly row: FieldSummaryRow;
  readonly selectedClass: string;
  readonly selection: ReturnType<typeof useWorkbenchContext>["selection"];
  readonly saveField: (
    object: ViewObject,
    field: FieldDefinition,
    value: string,
  ) => Promise<void>;
  readonly onSaveFailure: (
    object: ViewObject,
    field: FieldDefinition,
    value: string,
    error: unknown,
  ) => void;
}): ReactElement {
  const fields = fieldSummaryFields(row);
  const derived = fieldSummaryDerivedEntries(row.object);
  const downstream = downstreamCount(row.object);
  return (
    <tr
      className={selectedClass}
      onClick={() =>
        selection.select({
          entityType: "object",
          entityId: row.object.objectId,
        })
      }
    >
      <td className="field-summary-code">{objectCode(row.object)}</td>
      <td className="field-summary-name">{objectDisplayTitle(row.object)}</td>
      <td>{objectTypeLabel(row.object.objectType)}</td>
      <td>
        <div className="field-summary-fields">
          {fields.length === 0 ? (
            <span className="muted">无可编辑字段</span>
          ) : null}
          {fields.map((field) => (
            <InlineFieldEditor
              field={field}
              key={field.code}
              object={row.object}
              readOnly={fieldSummaryInputReadOnly(row.object)}
              onSave={(value) =>
                saveField(row.object, field, value).catch((error) =>
                  onSaveFailure(row.object, field, value, error),
                )
              }
              selection={selection}
            />
          ))}
        </div>
      </td>
      <td>
        <div className="field-summary-fx-list">
          {derived.length === 0 ? <span className="muted">—</span> : null}
          {derived.map(([code, value]) => (
            <FxChip
              key={code}
              label={fieldLabel(code)}
              value={formatSummaryValue(value)}
            />
          ))}
        </div>
      </td>
      <td className="field-summary-status">
        <RuleLamp status={row.object.ruleStatus} />
        {isRetiredStatus(row.object.status) ? (
          <span className="field-summary-retired">已淘汰</span>
        ) : (
          <span>{statusLabel(row.object.status)}</span>
        )}
      </td>
      <td>
        <ProvenancePassport
          downstream={downstream}
          freshness={relativeTime(row.object.updatedAt)}
          source={sourceLabel(row.object.source)}
        />
      </td>
    </tr>
  );
}

export function InlineFieldEditor({
  object,
  field,
  readOnly,
  selection,
  onSave,
}: {
  readonly object: ViewObject;
  readonly field: FieldDefinition;
  readonly readOnly: boolean;
  readonly selection: ReturnType<typeof useWorkbenchContext>["selection"];
  readonly onSave: (value: string) => void;
}): ReactElement {
  const value = String(object.fields[field.code] ?? "");
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  function commit(): void {
    if (readOnly || draft === value) return;
    onSave(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setDraft(value);
      event.currentTarget.blur();
    }
  }

  return (
    <label className="field-summary-field">
      <span>{fieldLabel(field.code, field.name)}</span>
      <input
        aria-label={`${objectDisplayTitle(object)} ${fieldLabel(
          field.code,
          field.name,
        )}`}
        onBlur={commit}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onClick={(event) => event.stopPropagation()}
        onFocus={() =>
          selection.select({
            entityType: "field",
            entityId: object.objectId,
            fieldCode: field.code,
          })
        }
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        value={draft}
      />
    </label>
  );
}

function formatSummaryValue(value: unknown): string {
  if (typeof value === "number") {
    return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  }
  return String(value);
}

function downstreamCount(object: ViewObject): number | undefined {
  const value = object.fields.downstreamCount ?? object.fields.dependencyCount;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function isRetiredStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return (
    normalized === "VOID" ||
    normalized === "DELETED" ||
    normalized === "SOFT_DELETED" ||
    normalized === "ARCHIVED" ||
    normalized === "FILED"
  );
}
