import type {
  DocumentBodyEditorActions,
  DocumentDataBlock,
  DocumentDataReferenceConfig,
  DocumentDataTableConfig,
} from "@m-next/views";
import { useMemo, useState, type ReactElement } from "react";

import { formatCellValue } from "../grid/grid-view-model";
import type { DataObject, FieldDef, SelectionRef } from "../model/kernel";
import { selectionStore } from "../state/selection-store";
import type { WorkspaceState } from "../state/workspace-store";
import type {
  StructuredDocumentConfig,
  StructuredDocumentFieldVm,
  StructuredDocumentObjectVm,
} from "./structured-document-view-model";

const terminalStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export function StructuredDocumentDataBlock({
  block,
  root,
  workspace,
  onSave,
}: {
  readonly block: DocumentDataBlock;
  readonly root: StructuredDocumentObjectVm;
  readonly workspace: WorkspaceState;
  readonly onSave: (field: StructuredDocumentFieldVm, value: string) => void;
}): ReactElement {
  return block.kind === "dataReference" ? (
    <ReferenceBlock
      config={block.config}
      onSave={onSave}
      root={root}
      workspace={workspace}
    />
  ) : (
    <TableBlock config={block.config} root={root} workspace={workspace} />
  );
}

export function resolveDataReference(
  workspace: WorkspaceState,
  root: StructuredDocumentObjectVm,
  config: DocumentDataReferenceConfig,
): {
  readonly field: StructuredDocumentFieldVm | null;
  readonly message: string | null;
  readonly objectLabel: string;
} {
  const object =
    config.objectBinding === "document-root"
      ? workspace.objects.find((item) => item.id === root.objectId)
      : workspace.objects.find(
          (item) =>
            (config.objectId === item.id ||
              (config.objectCode !== undefined &&
                item.fields.code?.value === config.objectCode)) &&
            (config.objectTypeCode === undefined ||
              config.objectTypeCode === item.objectTypeCode),
        );
  if (!object)
    return { field: null, message: "引用对象不存在", objectLabel: "" };
  if (terminalStatuses.has(object.status))
    return {
      field: null,
      message: "引用对象已处于终态",
      objectLabel: label(object),
    };
  if (
    config.relationTypeCode &&
    !workspace.relations.some(
      (relation) =>
        relation.status === "active" &&
        relation.sourceId === root.objectId &&
        relation.targetId === object.id &&
        relation.relationTypeCode === config.relationTypeCode,
    )
  )
    return {
      field: null,
      message: "引用关系不存在",
      objectLabel: label(object),
    };
  const field = workspace.objectTypes
    .find((type) => type.code === object.objectTypeCode)
    ?.fields.find((item) => item.code === config.fieldCode);
  return field
    ? {
        field: fieldVm(object, field),
        message: null,
        objectLabel: label(object),
      }
    : { field: null, message: "字段引用已失效", objectLabel: label(object) };
}

function ReferenceBlock({
  config,
  onSave,
  root,
  workspace,
}: {
  readonly config: DocumentDataReferenceConfig;
  readonly onSave: (field: StructuredDocumentFieldVm, value: string) => void;
  readonly root: StructuredDocumentObjectVm;
  readonly workspace: WorkspaceState;
}): ReactElement {
  const reference = resolveDataReference(workspace, root, config);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(
    reference.field ? String(reference.field.value ?? "") : "",
  );
  if (!reference.field) return <p role="alert">{reference.message}</p>;
  const field = reference.field;
  if (editing)
    return (
      <span className="us-structured-doc__editor">
        {field.field?.dataType === "enum" ? (
          <select
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          >
            {(field.field.enumValues ?? []).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : (
          <input
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
        )}
        <button
          onClick={() => {
            try {
              onSave(field, draft);
              setEditing(false);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "保存失败");
            }
          }}
          type="button"
        >
          保存
        </button>
        <button onClick={() => setEditing(false)} type="button">
          取消
        </button>
        {error ? <small role="alert">{error}</small> : null}
      </span>
    );
  return (
    <button
      className="us-structured-doc__field"
      data-writable={field.editable}
      onClick={() => selectionStore.set(fieldSelection(field))}
      onDoubleClick={() => field.editable && setEditing(true)}
      type="button"
    >
      <small>
        {field.fieldName} · {reference.objectLabel}
      </small>
      <strong>{field.valueText}</strong>
      {field.field?.computed ? <em>派生</em> : null}
    </button>
  );
}

function TableBlock({
  config,
  root,
  workspace,
}: {
  readonly config: DocumentDataTableConfig;
  readonly root: StructuredDocumentObjectVm;
  readonly workspace: WorkspaceState;
}): ReactElement {
  const table = useMemo(
    () => resolveDataTable(workspace, root, config),
    [config, root, workspace],
  );
  if (table.message) return <p role="alert">{table.message}</p>;
  if (table.rows.length === 0) return <p role="status">暂无可展示数据</p>;
  return (
    <section className="us-structured-doc__data-table">
      <table>
        <thead>
          <tr>
            {config.columns.map((column) => (
              <th key={column.id}>{column.label ?? column.fieldCode}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr
              key={row.object.id}
              onClick={() =>
                config.allowRowSelection !== false &&
                selectionStore.set({
                  entityType: "object",
                  entityId: row.object.id,
                })
              }
            >
              {row.cells.map((cell) => (
                <td data-state={cell.state} key={cell.id}>
                  {cell.text}
                  {cell.derived ? <em>派生</em> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.truncated ? (
        <p role="status">仅展示前 {table.maxRows} 条</p>
      ) : null}
    </section>
  );
}

export function resolveDataTable(
  workspace: WorkspaceState,
  root: StructuredDocumentObjectVm,
  config: DocumentDataTableConfig,
): {
  readonly message: string | null;
  readonly rows: readonly {
    readonly object: DataObject;
    readonly cells: readonly {
      readonly id: string;
      readonly text: string;
      readonly state: "fresh" | "dangling";
      readonly derived: boolean;
    }[];
  }[];
  readonly maxRows: number;
  readonly truncated: boolean;
} {
  const relations =
    config.scope === "document-root"
      ? config.relationTypeCode
        ? workspace.relations.filter(
            (relation) =>
              relation.status === "active" &&
              relation.sourceId === root.objectId &&
              relation.relationTypeCode === config.relationTypeCode,
          )
        : null
      : [];
  if (
    relations === null ||
    (config.scope === "document-root" && relations.length === 0)
  )
    return {
      message: "引用关系不存在",
      rows: [],
      maxRows: 0,
      truncated: false,
    };
  const candidates =
    config.scope === "document-root"
      ? relations.flatMap((relation) =>
          workspace.objects.filter((object) => object.id === relation.targetId),
        )
      : workspace.objects;
  const rows = candidates.filter(
    (object) =>
      object.objectTypeCode === config.objectTypeCode &&
      !terminalStatuses.has(object.status),
  );
  const filtered = config.filter
    ? rows.filter(
        (object) =>
          object.fields[config.filter!.fieldCode]?.value ===
          config.filter!.equals,
      )
    : rows;
  const ordered = config.sort
    ? [...filtered].sort(
        (left, right) =>
          String(
            left.fields[config.sort!.fieldCode]?.value ?? "",
          ).localeCompare(
            String(right.fields[config.sort!.fieldCode]?.value ?? ""),
          ) * (config.sort!.direction === "desc" ? -1 : 1),
      )
    : filtered;
  const maxRows = Math.max(1, Math.min(200, config.maxRows ?? 50));
  return {
    message: null,
    maxRows,
    truncated: ordered.length > maxRows,
    rows: ordered.slice(0, maxRows).map((object) => ({
      object,
      cells: config.columns.map((column) =>
        tableCell(workspace, object, column),
      ),
    })),
  };
}

function tableCell(
  workspace: WorkspaceState,
  source: DataObject,
  column: DocumentDataTableConfig["columns"][number],
): {
  readonly id: string;
  readonly text: string;
  readonly state: "fresh" | "dangling";
  readonly derived: boolean;
} {
  const object = (column.relationPath ?? []).reduce<DataObject | null>(
    (current, relationType) => {
      const relation =
        current &&
        workspace.relations.find(
          (item) =>
            item.status === "active" &&
            item.sourceId === current.id &&
            item.relationTypeCode === relationType,
        );
      return relation
        ? (workspace.objects.find(
            (item) =>
              item.id === relation.targetId &&
              !terminalStatuses.has(item.status),
          ) ?? null)
        : null;
    },
    source,
  );
  if (!object)
    return {
      id: column.id,
      text: "引用关系不存在",
      state: "dangling",
      derived: false,
    };
  const field = workspace.objectTypes
    .find((type) => type.code === object.objectTypeCode)
    ?.fields.find((item) => item.code === column.fieldCode);
  if (!field)
    return {
      id: column.id,
      text: "字段引用已失效",
      state: "dangling",
      derived: false,
    };
  const value = object.fields[field.code]?.value ?? null;
  return {
    id: column.id,
    text: value === null ? "（空）" : formatCellValue(value, field),
    state: "fresh",
    derived: field.computed === true,
  };
}

export function StructuredDocumentDataBlockActions({
  actions,
  config,
  root,
  workspace,
}: {
  readonly actions: DocumentBodyEditorActions;
  readonly config: StructuredDocumentConfig;
  readonly root: StructuredDocumentObjectVm;
  readonly workspace: WorkspaceState;
}): ReactElement {
  const objects = workspace.objects.filter(
    (object) => !terminalStatuses.has(object.status),
  );
  const [objectId, setObjectId] = useState(root.objectId);
  const object = objects.find((item) => item.id === objectId) ?? null;
  const fields = object
    ? (workspace.objectTypes.find((type) => type.code === object.objectTypeCode)
        ?.fields ?? [])
    : [];
  const [fieldCode, setFieldCode] = useState(fields[0]?.code ?? "");
  const reference =
    object && fieldCode
      ? {
          objectTypeCode: object.objectTypeCode,
          objectId: object.id,
          objectCode: String(object.fields.code?.value ?? ""),
          fieldCode,
        }
      : null;
  return (
    <span className="document-body-data-actions">
      <select
        aria-label="引用对象"
        onChange={(event) => setObjectId(event.target.value)}
        value={objectId}
      >
        {objects.map((item) => (
          <option key={item.id} value={item.id}>
            {label(item)}
          </option>
        ))}
      </select>
      <select
        aria-label="引用字段"
        onChange={(event) => setFieldCode(event.target.value)}
        value={fieldCode}
      >
        {fields.map((field) => (
          <option key={field.code} value={field.code}>
            {field.name}
          </option>
        ))}
      </select>
      <button
        disabled={!reference}
        onClick={() => reference && actions.insertDataReference(reference)}
        type="button"
      >
        插入引用
      </button>
      {reference && actions.selectedBlock?.kind === "dataReference" ? (
        <button
          onClick={() =>
            actions.replaceSelectedBlock({
              kind: "dataReference",
              config: reference,
            })
          }
          type="button"
        >
          更新引用
        </button>
      ) : null}
      {config.dataReferenceTemplates.map((template) => (
        <button
          key={template.id}
          onClick={() => actions.insertDataReference(template.config)}
          type="button"
        >
          插入{template.label}
        </button>
      ))}
      {config.dataTableTemplates.map((template) => (
        <button
          key={template.id}
          onClick={() => actions.insertDataTable(template.config)}
          type="button"
        >
          插入{template.label}
        </button>
      ))}
      {actions.selectedBlock?.kind === "dataTable"
        ? config.dataTableTemplates.map((template) => (
            <button
              key={`replace-${template.id}`}
              onClick={() =>
                actions.replaceSelectedBlock({
                  kind: "dataTable",
                  config: template.config,
                })
              }
              type="button"
            >
              更新为{template.label}
            </button>
          ))
        : null}
      {actions.selectedBlock ? (
        <button onClick={actions.removeSelectedBlock} type="button">
          删除数据块
        </button>
      ) : null}
    </span>
  );
}

function fieldVm(
  object: DataObject,
  field: FieldDef,
): StructuredDocumentFieldVm {
  const value = object.fields[field.code]?.value ?? null;
  return {
    objectId: object.id,
    objectTypeCode: object.objectTypeCode,
    objectVersion: object.version,
    fieldCode: field.code,
    fieldName: field.name,
    field,
    value,
    valueText: value === null ? "（空）" : formatCellValue(value, field),
    state: "fresh",
    editable:
      !field.computed &&
      !field.readOnly &&
      !terminalStatuses.has(object.status),
    editMessage: null,
  };
}
function fieldSelection(field: StructuredDocumentFieldVm): SelectionRef {
  return {
    entityType: "field",
    entityId: field.objectId,
    fieldCode: field.fieldCode,
  };
}
function label(object: DataObject): string {
  return String(
    object.fields.name?.value ?? object.fields.code?.value ?? object.id,
  );
}
