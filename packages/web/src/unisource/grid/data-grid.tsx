import { useMemo, useState } from "react";

import type { DataObject, ObjectTypeDef } from "../model/kernel";
import { UsStatusPill } from "../primitives";
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
}: {
  readonly objectType: ObjectTypeDef;
  readonly objects: readonly DataObject[];
  readonly search?: string;
  readonly hideEol?: boolean;
  readonly compact?: boolean;
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
  });

  const submit = (objectId: string, cell: GridCellVm, value: string) => {
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
                <span className="us-grid__mark">{column.typeMark}</span>
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
                    data-ref-state={cell.refState ?? undefined}
                    key={cell.field.code}
                    onDoubleClick={() =>
                      setEditing({
                        objectId: row.objectId,
                        fieldCode: cell.field.code,
                        value: cell.value === null ? "" : String(cell.value),
                      })
                    }
                  >
                    {active ? (
                      <input
                        autoFocus
                        className="us-grid__editor"
                        onBlur={(event) =>
                          submit(row.objectId, cell, event.currentTarget.value)
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
                    ) : (
                      <span className="us-grid__cell">{cell.text}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
