import type { RawImport } from "../model/view-layer";
import { UsMonoTag } from "../primitives";

export function SemanticChips({
  chips,
}: {
  readonly chips: RawImport["semanticChips"];
}) {
  return (
    <div className="us-semchips">
      {chips.map((chip) => (
        <span key={chip.label}>
          {chip.label}
          <UsMonoTag>{Math.round(chip.confidence * 100)}%</UsMonoTag>
        </span>
      ))}
    </div>
  );
}
