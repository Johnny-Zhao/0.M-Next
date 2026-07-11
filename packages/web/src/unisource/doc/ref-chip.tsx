import type { DataFieldPrimitive, FieldDef } from "../model/kernel";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { formatCellValue } from "../grid/grid-view-model";

export function RefChip({
  objectId,
  fieldCode,
  exprId,
  label,
}: {
  readonly objectId: string;
  readonly fieldCode: string;
  readonly exprId?: string;
  readonly label: string;
}) {
  const workspace = useWorkspaceSnapshot();
  const object = workspace.objects.find((item) => item.id === objectId);
  const objectType = workspace.objectTypes.find(
    (type) => type.code === object?.objectTypeCode,
  );
  const field = objectType?.fields.find(
    (candidate) => candidate.code === fieldCode,
  );
  const ref = workspace.fieldRefs.find(
    (candidate) =>
      candidate.objectId === objectId &&
      candidate.fieldCode === fieldCode &&
      (exprId === undefined || candidate.exprId === exprId),
  );
  const value = object?.fields[fieldCode]?.value ?? null;
  return (
    <span
      className="us-refchip"
      data-state={ref?.state ?? "fresh"}
      title={ref?.label ?? label}
    >
      <span>{label}</span>
      <b>{formatReferenceValue(value, field)}</b>
    </span>
  );
}

function formatReferenceValue(
  value: DataFieldPrimitive,
  field: FieldDef | undefined,
): string {
  if (!field) return value === null ? "—" : String(value);
  return formatCellValue(value, field);
}
