import { useEffect, useState, type ReactElement, type ReactNode } from "react";

import {
  collectRuleStatusSummary,
  ValidatePanel,
  type RuleStatusSummary,
} from "./validate-panel";
import { useWorkbenchContext } from "./workbench";

export function validationSummaryText(
  summary: Pick<RuleStatusSummary, "block" | "warn" | "ok"> | null,
): string {
  if (!summary) return "校验摘要不可用";
  const total = summary.block + summary.warn + summary.ok;
  return `校验 ${total} · 红 ${summary.block} 黄 ${summary.warn} 绿 ${summary.ok}`;
}

export function ValidationDrawerView(props: {
  readonly open: boolean;
  readonly summary: Pick<RuleStatusSummary, "block" | "warn" | "ok"> | null;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly panel?: ReactNode;
}): ReactElement {
  return (
    <section className="validation-drawer" data-open={props.open}>
      <button
        className="validation-drawer-bar"
        onClick={props.onToggle}
        type="button"
      >
        <span>{validationSummaryText(props.summary)}</span>
        <strong>{props.open ? "收起" : "展开"}</strong>
      </button>
      {props.open ? (
        <div className="validation-drawer-body">
          <header>
            <strong>校验</strong>
            <button
              aria-label="关闭校验抽屉"
              onClick={props.onClose}
              type="button"
            >
              ×
            </button>
          </header>
          <div className="validation-drawer-content">
            {props.panel ?? <ValidatePanel />}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ValidationDrawer(props: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}): ReactElement {
  const { refreshVersion, reportError, viewClient, workspaceId } =
    useWorkbenchContext();
  const [summary, setSummary] = useState<RuleStatusSummary | null>(null);

  useEffect(() => {
    let disposed = false;
    async function loadSummary(): Promise<void> {
      try {
        const nextSummary = await collectRuleStatusSummary({
          viewClient,
          workspaceId,
        });
        if (!disposed) setSummary(nextSummary);
      } catch (error) {
        if (!disposed) setSummary(null);
        reportError(error instanceof Error ? error.message : "校验摘要不可用");
      }
    }
    void loadSummary();
    return () => {
      disposed = true;
    };
  }, [refreshVersion, reportError, viewClient, workspaceId]);

  return (
    <ValidationDrawerView
      onClose={props.onClose}
      onToggle={props.onToggle}
      open={props.open}
      summary={summary}
    />
  );
}
