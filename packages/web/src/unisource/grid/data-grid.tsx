import { useMemo } from "react";

import type { DataObject, ObjectTypeDef } from "../model/kernel";
import { IconCalendar, IconDoc, IconPerson, UsStatusPill } from "../primitives";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { buildGridViewModel } from "./grid-view-model";

export function DataGrid({
  objectType,
  objects,
  search,
  hideEol,
  compact = false,
  maskValues = false,
  showCreatePlaceholder = true,
  onCreate,
  createDisabled = false,
  createDisabledReason,
}: {
  readonly objectType: ObjectTypeDef;
  readonly objects: readonly DataObject[];
  readonly search?: string;
  readonly hideEol?: boolean;
  readonly compact?: boolean;
  readonly maskValues?: boolean;
  readonly showCreatePlaceholder?: boolean;
  readonly onCreate?: () => void;
  readonly createDisabled?: boolean;
  readonly createDisabledReason?: string;
}) {
  const workspace = useWorkspaceSnapshot();
  const selection = useSelectionSnapshot();
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
                  >
                    <span className="us-grid__cell">{cell.text}</span>
                  </td>
                );
              })}
            </tr>
          ))}
          {showCreatePlaceholder && onCreate ? (
            <tr className="us-grid__newrow">
              <td colSpan={vm.columns.length + 2}>
                {createDisabled ? (
                  <small>{createDisabledReason}</small>
                ) : (
                  <button onClick={onCreate} type="button">
                    + 新建记录
                  </button>
                )}
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
