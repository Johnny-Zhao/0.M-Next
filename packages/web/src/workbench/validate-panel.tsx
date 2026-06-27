import { useCallback, useEffect, useState, type ReactElement } from "react";

import type { CheckResultItem, RuleStatus, ViewObject } from "@m-next/views";

import { useWorkbenchContext } from "./workbench";

export type ValidateTone = "block" | "warn" | "info";

export interface RuleStatusSummary {
  readonly block: number;
  readonly warn: number;
  readonly ok: number;
  readonly unknown: number;
  readonly hits: readonly ViewObject[];
}

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

export function summarizeRuleStatus(
  objects: readonly ViewObject[],
): RuleStatusSummary {
  return {
    block: objects.filter((object) => object.ruleStatus === "BLOCK").length,
    warn: objects.filter((object) => object.ruleStatus === "WARN").length,
    ok: objects.filter((object) => object.ruleStatus === "OK").length,
    unknown: objects.filter((object) => object.ruleStatus === "UNKNOWN").length,
    hits: objects.filter((object) => object.ruleStatus !== "OK"),
  };
}

export function ruleStatusLabel(status: RuleStatus): string {
  if (status === "BLOCK") return "阻断";
  if (status === "WARN") return "告警";
  if (status === "OK") return "通过";
  return "未知";
}

/**
 * 校验面板:触发一次规则校验运行(RunRuleCheck),列出命中结果。
 * 点击某条结果在画布中选中对应图元。规则引擎/权限缺失时优雅降级。
 */
export function ValidatePanel(): ReactElement {
  const context = useWorkbenchContext();
  const {
    actorId,
    objectType,
    refreshVersion,
    reportError,
    selection,
    viewClient,
    workspaceId,
  } = context;
  const [results, setResults] = useState<readonly CheckResultItem[] | null>(
    null,
  );
  const [summary, setSummary] = useState<RuleStatusSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const loadSummary = useCallback(async (): Promise<void> => {
    setLoadingSummary(true);
    try {
      const page = await viewClient.objects(workspaceId, objectType, 0, 200);
      setSummary(summarizeRuleStatus(page.items));
    } catch (error) {
      reportError(error instanceof Error ? error.message : "读取规则状态失败");
      setMessage("规则状态读取失败,请稍后刷新。");
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, [objectType, reportError, viewClient, workspaceId]);

  useEffect(() => {
    void loadSummary();
  }, [refreshVersion, loadSummary]);

  async function revalidate(): Promise<void> {
    setRunning(true);
    setMessage("");
    try {
      const runId = await viewClient.runRuleCheck(
        workspaceId,
        actorId,
        objectType || null,
      );
      const page = await viewClient.checkResults(workspaceId, runId);
      setResults(page.items);
      if (page.items.length === 0) {
        setMessage("✓ 全部规则通过,无告警或阻断。");
      }
      await loadSummary();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "校验失败");
      setMessage("校验运行失败,请检查后端规则引擎与权限后重试。");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-label="校验" className="validate-panel">
      <div className="validate-panel-bar">
        <strong>校验</strong>
        {summary ? (
          <span className="validate-count">
            {summary.block + summary.warn + summary.ok}
          </span>
        ) : null}
        <span className="validate-spacer" />
        <button
          className="validate-run"
          disabled={running}
          onClick={() => void revalidate()}
          type="button"
        >
          {running ? "运行中..." : "重新校验"}
        </button>
      </div>
      {loadingSummary ? (
        <p className="validate-empty">规则灯汇总加载中...</p>
      ) : null}
      {summary ? (
        <div className="validate-summary" aria-label="规则灯汇总">
          <span className="validate-summary-block">红 {summary.block}</span>
          <span className="validate-summary-warn">黄 {summary.warn}</span>
          <span className="validate-summary-ok">绿 {summary.ok}</span>
          {summary.unknown > 0 ? (
            <span className="validate-summary-unknown">
              未知 {summary.unknown}
            </span>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p className="validate-message" role="status">
          {message}
        </p>
      ) : null}
      {summary && summary.hits.length > 0 && !results ? (
        <ul className="validate-list" aria-label="规则灯命中对象">
          {summary.hits.map((object) => (
            <li key={object.objectId}>
              <button
                className={`validate-row validate-row-${severityTone(
                  object.ruleStatus,
                )}`}
                onClick={() =>
                  selection.select({
                    entityType: "object",
                    entityId: object.objectId,
                  })
                }
                type="button"
              >
                <span
                  className={`validate-badge validate-badge-${severityTone(
                    object.ruleStatus,
                  )}`}
                >
                  {ruleStatusLabel(object.ruleStatus)}
                </span>
                <span className="validate-rule">{object.objectType}</span>
                <span className="validate-msg">
                  {objectName(object)} {ruleStatusLabel(object.ruleStatus)}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
                  selection.select({
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
          当前规则灯来自对象视图;点击「重新校验」可触发规则引擎刷新。
        </p>
      ) : null}
    </section>
  );
}

function objectName(object: ViewObject): string {
  const value = object.fields.name ?? object.fields.title ?? object.objectId;
  return typeof value === "string" && value.trim() !== ""
    ? value
    : object.objectId;
}
