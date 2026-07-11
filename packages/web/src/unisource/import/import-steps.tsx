import type { ImportViewModel } from "./import-view-model";

export function ImportSteps({
  steps,
}: {
  readonly steps: ImportViewModel["steps"];
}) {
  return (
    <ol className="us-steps">
      {steps.map((step, index) => (
        <li data-state={step.state} key={step.label}>
          <b>{index + 1}</b>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
