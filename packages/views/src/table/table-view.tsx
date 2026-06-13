import { useEffect, useState, type ReactElement } from "react";

import {
  CommandFailure,
  type CommandClient,
  type ConflictField,
} from "../api/command-client";
import type {
  FieldDefinition,
  ObjectPage,
  ObjectType,
  ViewClient,
  ViewObject,
} from "../api/view-client";
import { ConflictDialog } from "../conflict/conflict-dialog";
import type { SelectionCoordinator } from "../selection/selection-coordinator";
import type { SelectionRef } from "../selection/selection-ref";

const terminalStatuses = new Set([
  "CONFIRMED",
  "VOID",
  "DELETED",
  "FILED",
  "ARCHIVED",
]);

export function isTerminalStatus(status: string): boolean {
  return terminalStatuses.has(status);
}

export function tableColumns(
  type: ObjectType | null,
): readonly FieldDefinition[] {
  return type?.fields ?? [];
}

export function cellClassName(
  selection: SelectionRef | null,
  objectId: string,
  fieldCode: string,
  failed: boolean,
): string {
  const selected =
    selection?.entityType === "field" &&
    selection.entityId === objectId &&
    selection.fieldCode === fieldCode;
  return `${selected ? "selected-cell" : ""} ${failed ? "failed-cell" : ""}`;
}

export interface TableViewProps {
  readonly workspaceId: string;
  readonly objectType: string;
  readonly viewClient: ViewClient;
  readonly commandClient: CommandClient;
  readonly selection: SelectionCoordinator;
  readonly pageSize?: number;
  readonly onError?: (title: string) => void;
}

interface EditingCell {
  readonly objectId: string;
  readonly field: FieldDefinition;
  readonly value: string;
}

interface ConflictState {
  readonly row: ViewObject;
  readonly cell: EditingCell;
  readonly currentVersion: number;
  readonly fields: readonly ConflictField[];
}

export function TableView(props: TableViewProps): ReactElement {
  const [type, setType] = useState<ObjectType | null>(null);
  const [page, setPage] = useState<ObjectPage>({
    items: [],
    page: 0,
    pageSize: 50,
    total: 0,
  });
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [failedCell, setFailedCell] = useState<string | null>(null);

  useEffect(() => {
    void props.viewClient.objectTypes(props.workspaceId).then((types) => {
      setType(
        types.find((candidate) => candidate.code === props.objectType) ?? null,
      );
    });
    void props.viewClient
      .objects(props.workspaceId, props.objectType, 0, props.pageSize ?? 50)
      .then(setPage);
    return props.selection.subscribe(setSelected);
  }, [props]);

  async function save(row: ViewObject, cell: EditingCell): Promise<void> {
    setEditing(null);
    try {
      await props.commandClient.updateFields(
        props.workspaceId,
        row.objectId,
        row.version,
        [
          {
            fieldDefCode: cell.field.code,
            value: cell.value,
            expectedFieldVersion: row.version,
          },
        ],
      );
      setPage({
        ...page,
        items: page.items.map((item) =>
          item.objectId === row.objectId
            ? {
                ...item,
                version: item.version + 1,
                fields: { ...item.fields, [cell.field.code]: cell.value },
              }
            : item,
        ),
      });
    } catch (error) {
      handleFailure(row, cell, error);
    }
  }

  function handleFailure(
    row: ViewObject,
    cell: EditingCell,
    error: unknown,
  ): void {
    setFailedCell(`${row.objectId}:${cell.field.code}`);
    if (
      error instanceof CommandFailure &&
      error.commandError.code === "KERNEL-409-VERSION-CONFLICT"
    ) {
      setConflict({
        row,
        cell,
        currentVersion:
          error.commandError.details?.currentVersion ?? row.version,
        fields: error.commandError.details?.conflictingFields ?? [],
      });
    } else {
      props.onError?.(error instanceof Error ? error.message : "保存失败");
    }
  }

  function loadPage(pageNumber: number): void {
    void props.viewClient
      .objects(
        props.workspaceId,
        props.objectType,
        pageNumber,
        props.pageSize ?? 50,
      )
      .then(setPage);
  }

  function resolveConflict(
    choices: Readonly<Record<string, "mine" | "current">>,
  ): void {
    if (!conflict) return;
    const field = conflict.fields.find(
      (item) => item.fieldDefCode === conflict.cell.field.code,
    );
    if (choices[conflict.cell.field.code] === "mine") {
      void save(
        { ...conflict.row, version: conflict.currentVersion },
        conflict.cell,
      );
    } else if (field) {
      setPage({
        ...page,
        items: page.items.map((item) =>
          item.objectId === conflict.row.objectId
            ? {
                ...item,
                version: conflict.currentVersion,
                fields: {
                  ...item.fields,
                  [field.fieldDefCode]: field.currentValue,
                },
              }
            : item,
        ),
      });
    }
    setConflict(null);
  }

  const fields = tableColumns(type);
  return (
    <section aria-label="表格视图">
      <table>
        <thead>
          <tr>
            <th>#</th>
            {fields.map((field) => (
              <th key={field.code}>{field.name}</th>
            ))}
            <th>状态</th>
            <th>版本</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((row, index) => (
            <tr
              key={row.objectId}
              onClick={() =>
                props.selection.select({
                  entityType: "object",
                  entityId: row.objectId,
                })
              }
            >
              <td>{index + 1}</td>
              {fields.map((field) => (
                <Cell
                  editing={editing}
                  failed={failedCell === `${row.objectId}:${field.code}`}
                  field={field}
                  highlighted={
                    selected?.entityType === "field" &&
                    selected.entityId === row.objectId &&
                    selected.fieldCode === field.code
                  }
                  key={field.code}
                  onEdit={setEditing}
                  onSave={(cell) => void save(row, cell)}
                  row={row}
                />
              ))}
              <td>
                {isTerminalStatus(row.status) ? `🔒 ${row.status}` : row.status}
              </td>
              <td>v{row.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        第 {page.page + 1} 页 共 {page.total} 条
      </p>
      <button
        disabled={page.page === 0}
        onClick={() => loadPage(page.page - 1)}
        type="button"
      >
        上一页
      </button>
      <button
        disabled={(page.page + 1) * page.pageSize >= page.total}
        onClick={() => loadPage(page.page + 1)}
        type="button"
      >
        下一页
      </button>
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

interface CellProps {
  readonly row: ViewObject;
  readonly field: FieldDefinition;
  readonly editing: EditingCell | null;
  readonly highlighted: boolean;
  readonly failed: boolean;
  readonly onEdit: (cell: EditingCell) => void;
  readonly onSave: (cell: EditingCell) => void;
}

function Cell(props: CellProps): ReactElement {
  const active =
    props.editing?.objectId === props.row.objectId &&
    props.editing.field.code === props.field.code;
  const value = String(props.row.fields[props.field.code] ?? "");
  const selection: SelectionRef | null = props.highlighted
    ? {
        entityType: "field",
        entityId: props.row.objectId,
        fieldCode: props.field.code,
      }
    : null;
  const className = cellClassName(
    selection,
    props.row.objectId,
    props.field.code,
    props.failed,
  );
  return (
    <td
      className={className}
      onDoubleClick={() => {
        if (!isTerminalStatus(props.row.status)) {
          props.onEdit({
            objectId: props.row.objectId,
            field: props.field,
            value,
          });
        }
      }}
    >
      {active ? (
        <input
          aria-label={`编辑 ${props.field.name}`}
          autoFocus
          defaultValue={props.editing.value}
          onBlur={(event) =>
            props.onSave({
              ...props.editing!,
              value: event.currentTarget.value,
            })
          }
        />
      ) : (
        value
      )}
    </td>
  );
}
