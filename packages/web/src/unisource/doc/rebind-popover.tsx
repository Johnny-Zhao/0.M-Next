import type { FieldDef } from "../model/kernel";
import type { DocRefVm } from "./doc-view-model";
import { RefInsertPopover } from "./ref-insert-popover";

export function RebindPopover({
  refVm,
  fields,
  onRebind,
  onCancel,
}: {
  readonly refVm: DocRefVm;
  readonly fields: readonly FieldDef[];
  readonly onRebind: (field: FieldDef) => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className="us-rebindpop">
      <RefInsertPopover
        fields={fields}
        onCancel={onCancel}
        onInsert={onRebind}
        onQuery={() => undefined}
        query=""
      />
      <p>悬空引用「{refVm.label}」也可在校验中心批量处理(006)</p>
    </div>
  );
}
