import { useMemo, useState } from "react";

import type { DataObject, ObjectTypeDef } from "../model/kernel";
import {
  IconCalendar,
  IconDoc,
  IconPerson,
  UsStatusPill,
  pushToast,
} from "../primitives";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { commitCellEdit } from "./grid-actions";
import { buildGridViewModel, type GridCellVm } from "./grid-view-model";

interface EditingCell {
  readonly objectId: string;
  readonly fieldCode: string;
  readonly value: string;
}

export function DataGrid({
  objectType,
  objects,
  search,
  hideEol,
  compact = false,
  maskValues = false,
  showCreatePlaceholder = true,
}: {
  readonly objectType: ObjectTypeDef;
  readonly objects: readonly DataObject[];
  readonly search?: string;
  readonly hideEol?: boolean;
  readonly compact?: boolean;
  readonly maskValues?: boolean;
  readonly showCreatePlaceholder?: boolean;
}) {
  const workspace = useWorkspaceSnapshot();
  const selection = useSelectionSnapshot();
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const selectedIds = useMemo(
    () =>
      new Set(
        selection.selected
          .filter((item) => item.entityType === "object")
          .map((item) => item.entityId),
      ),
    [selection.selected],
  );
  const vm = buildGridViewModel({
    objectType,
    objects,
    selectedIds,
    fieldRefs: workspace.fieldRefs,
    search,
    hideEol,
    maskValues,
  });

  const submit = (objectId: string, cell: GridCellVm, value: string) => {
    if (!canEditGridField(cell.field, cell.masked)) {
      setEditing(null);
      return;
    }
    commitCellEdit({
      objectTypeCode: objectType.code,
      objectId,
      fieldCode: cell.field.code,
      dataType: cell.field.dataType,
      rawValue: value,
    });
    setEditing(null);
  };

  return (
    <div className="us-grid" data-compact={compact}>
      <table>
        <thead>
          <tr>
            <th className="us-grid__checkcol" aria-label="选择" />
            <th aria-label="状态" />
            {vm.columns.map((column) => (
              <th key={column.code}>
                <span className="us-grid__mark">
                  <ColumnTypeMark mark={column.typeMark} />
                </span>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vm.rows.map((row) => (
            <tr
              data-editing={editing?.objectId === row.objectId || undefined}
              data-selected={row.selected}
              id={`us-row-${row.objectId}`}
              key={row.objectId}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) {
                  selectionStore.toggle({
                    entityType: "object",
                    entityId: row.objectId,
                  });
                  return;
                }
                selectionStore.set({
                  entityType: "object",
                  entityId: row.objectId,
                });
              }}
            >
              <td className="us-grid__checkcol">
                <button
                  aria-label={row.selected ? "取消选择" : "选择记录"}
                  className="us-grid__check"
                  data-checked={row.selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectionStore.toggle({
                      entityType: "object",
                      entityId: row.objectId,
                    });
                  }}
                  type="button"
                >
                  {row.selected ? "✓" : ""}
                </button>
              </td>
              <td>
                <UsStatusPill tone={row.statusTone}>
                  {row.statusLabel}
                </UsStatusPill>
              </td>
              {row.cells.map((cell) => {
                const active =
                  editing?.objectId === row.objectId &&
                  editing.fieldCode === cell.field.code;
                return (
                  <td
                    data-masked={cell.masked || undefined}
                    data-readonly={cell.field.readOnly || undefined}
                    data-ref-state={cell.refState ?? undefined}
                    key={cell.field.code}
                    onClick={(event) => {
                      event.stopPropagation();
                      const ref = {
                        entityType: "field" as const,
                        entityId: row.objectId,
                        fieldCode: cell.field.code,
                      };
                      if (event.metaKey || event.ctrlKey || event.shiftKey) {
                        selectionStore.toggle(ref);
                        return;
                      }
                      selectionStore.set(ref);
                    }}
                    onDoubleClick={() => {
                      if (!canEditGridField(cell.field, cell.masked)) return;
                      setEditing({
                        objectId: row.objectId,
                        fieldCode: cell.field.code,
                        value: cell.value === null ? "" : String(cell.value),
                      });
                    }}
                  >
                    {active ? (
                      <span className="us-grid__editwrap">
                        <em className="us-grid__editbadge">确认写入</em>
                        <input
                          autoFocus
                          className="us-grid__editor"
                          onBlur={(event) =>
                            submit(
                              row.objectId,
                              cell,
                              event.currentTarget.value,
                            )
                          }
                          onChange={(event) =>
                            setEditing({
                              objectId: row.objectId,
                              fieldCode: cell.field.code,
                              value: event.currentTarget.value,
                            })
                          }
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setEditing(null);
                            if (event.key === "Enter") {
                              submit(
                                row.objectId,
                                cell,
                                event.currentTarget.value,
                              );
                            }
                          }}
                          value={editing.value}
                        />
                      </span>
                    ) : (
                      <span className="us-grid__cell">{cell.text}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {showCreatePlaceholder ? (
            <tr className="us-grid__newrow">
              <td colSpan={vm.columns.length + 2}>
                <button
                  onClick={() => pushToast({ title: "新建记录将在 P2 接入" })}
                  type="button"
                >
                  + 新建记录
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function canEditGridField(
  field: ObjectTypeDef["fields"][number],
  masked = false,
): boolean {
  return !masked && !field.computed && !field.readOnly;
}

function ColumnTypeMark({ mark }: { readonly mark: string }) {
  if (mark === "date") return <IconCalendar size={12} />;
  if (mark === "person") return <IconPerson size={12} />;
  if (mark === "doc") return <IconDoc size={12} />;
  return <>{mark}</>;
}
