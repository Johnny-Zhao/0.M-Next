import { UsMonoTag } from "../primitives";
import type { GridStatusBarVm } from "./grid-view-model";

export function GridStatusBar({
  status,
}: {
  readonly status: GridStatusBarVm;
}) {
  return (
    <footer className="us-grid-status">
      <span>{status.total} 条记录</span>
      <span>已选 {status.selected}</span>
      {status.averageLabel ? (
        <UsMonoTag tone="primary">{status.averageLabel}</UsMonoTag>
      ) : null}
    </footer>
  );
}
