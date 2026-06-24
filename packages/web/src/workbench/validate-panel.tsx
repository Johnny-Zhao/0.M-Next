import { useState, type ReactElement } from "react";

import type { CheckResultItem } from "@m-next/views";

import { useWorkbenchContext } from "./workbench";

export type ValidateTone = "block" | "warn" | "info";

/** 规则严重级 → 视觉色调。纯函数,便于测试。 */
export function severityTone(severity: string): ValidateTone {
  const upper = severity.toUpperCase();
  if (upper === "BLOCK") return "block";
  if (upper === "WARN") return "warn";
  return "info";
}

export function severityLabel(severity: string): string {
  const upper = severity.toUpperCase();
  if (upper === "BLOCK") return "阻断";
  if (upper === "WARN") return "告警";
  if (upper === "INFO") return "提示";
  return severity;
}

/**
 * 校验面板:触发一次规则校验运行(RunRuleCheck),列出命中结果。
 * 点击某条结果在画布中选中对应图元。规则引擎/权限缺失时优雅降级。
 */
export function ValidatePanel(): ReactElement {
  const context = useWorkbenchContext();
  const [results, setResults] = useState<readonly CheckResultItem[] | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function revalidate(): Promise<void> {
    setRunning(true);
    setMessage("");
    try {
      const runId = await context.viewClient.runRuleCheck(
        context.workspaceId,
        context.actorId,
        context.objectType || null,
      );
      const page = await context.viewClient.checkResults(
        context.workspaceId,
        runId,
      );
      setResults(page.items);
      if (page.items.length === 0) {
        setMessage("✓ 全部规则通过,无告警或阻断。");
      }
    } catch (error) {
      context.reportError(error instanceof Error ? error.message : "校验失败");
      setMessage("校验运行失败,请检查后端规则引擎与权限后重试。");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-label="校验" className="validate-panel">
      <div className="validate-panel-bar">
        <strong>校验</strong>
        {results ? (
          <span className="validate-count">{results.length}</span>
        ) : null}
        <span className="validate-spacer" />
        <button
          className="validate-run"
          disabled={running}
          onClick={() => void revalidate()}
          type="button"
        >
          {running ? "运行中…" : "运行校验"}
        </button>
      </div>
      {message ? (
        <p className="validate-message" role="status">
          {message}
        </p>
      ) : null}
      {results && results.length > 0 ? (
        <ul className="validate-list">
          {results.map((result) => (
            <li
              key={`${result.ruleCode}-${result.objectId}-${result.fieldCode ?? ""}`}
            >
              <button
                className={`validate-row validate-row-${severityTone(result.severity)}`}
                onClick={() =>
                  context.selection.select({
                    entityType: "object",
                    entityId: result.objectId,
                  })
                }
                type="button"
              >
                <span
                  className={`validate-badge validate-badge-${severityTone(result.severity)}`}
                >
                  {severityLabel(result.severity)}
                </span>
                <span className="validate-rule">{result.ruleCode}</span>
                <span className="validate-msg">{result.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!results && !running ? (
        <p className="validate-empty">
          尚未运行校验。点击「运行校验」对当前模型评估规则。
        </p>
      ) : null}
    </section>
  );
}
