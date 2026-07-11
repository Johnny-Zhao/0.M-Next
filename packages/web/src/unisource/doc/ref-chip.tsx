import type { KeyboardEvent } from "react";

import type { DataFieldPrimitive, FieldDef } from "../model/kernel";
import { IconCheck, UsMonoTag } from "../primitives";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { formatCellValue } from "../grid/grid-view-model";
import type { DocRefVm } from "./doc-view-model";

export function RefChip({
  refVm,
  objectId,
  fieldCode,
  exprId,
  label,
  insertingQuery,
  onActivateDangling,
}: {
  readonly refVm?: DocRefVm;
  readonly objectId?: string;
  readonly fieldCode?: string;
  readonly exprId?: string;
  readonly label?: string;
  readonly insertingQuery?: string;
  readonly onActivateDangling?: (ref: DocRefVm) => void;
}) {
  const workspace = useWorkspaceSnapshot();
  const fallbackObjectId = objectId ?? refVm?.objectId ?? "";
  const fallbackFieldCode = fieldCode ?? refVm?.fieldCode ?? "";
  const object = workspace.objects.find((item) => item.id === fallbackObjectId);
  const objectType = workspace.objectTypes.find(
    (type) => type.code === object?.objectTypeCode,
  );
  const field = objectType?.fields.find(
    (candidate) => candidate.code === fallbackFieldCode,
  );
  const ref = workspace.fieldRefs.find(
    (candidate) =>
      candidate.objectId === fallbackObjectId &&
      candidate.fieldCode === fallbackFieldCode &&
      (exprId === undefined || candidate.exprId === exprId),
  );
  const value = object?.fields[fallbackFieldCode]?.value ?? null;
  const fallbackRef: DocRefVm = {
    refId: ref?.id ?? `${fallbackObjectId}-${fallbackFieldCode}`,
    objectId: fallbackObjectId,
    fieldCode: fallbackFieldCode,
    fieldName: field?.name ?? fallbackFieldCode,
    value,
    valueText: formatReferenceValue(value, field),
    state: ref?.state ?? "fresh",
    label: ref?.label ?? label ?? fallbackFieldCode,
    chipDomId: `ref-${ref?.id ?? `${fallbackObjectId}-${fallbackFieldCode}`}`,
    confidenceLabel: ref?.state === "lowConfidence" ? "74%" : undefined,
  };
  const chip = refVm ?? fallbackRef;
  const text =
    chip.state === "inserting" ? `@${insertingQuery ?? ""}` : chip.valueText;
  const activate = () => {
    if (chip.state === "dangling") onActivateDangling?.(chip);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  };

  return (
    <button
      className="us-refchip"
      data-state={chip.state}
      id={chip.chipDomId}
      onClick={activate}
      onKeyDown={onKeyDown}
      tabIndex={chip.state === "dangling" ? 0 : -1}
      title={`${chip.label} · ${chip.fieldName}`}
      type="button"
    >
      {chip.state === "justSynced" ? <IconCheck size={12} /> : null}
      <b>{text}</b>
      {chip.confidenceLabel ? (
        <UsMonoTag tone="change">{chip.confidenceLabel}</UsMonoTag>
      ) : null}
    </button>
  );
}

function formatReferenceValue(
  value: DataFieldPrimitive,
  field: FieldDef | undefined,
): string {
  if (!field) return value === null ? "—" : String(value);
  return formatCellValue(value, field);
}
