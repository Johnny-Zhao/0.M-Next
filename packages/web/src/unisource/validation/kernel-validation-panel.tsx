import { useMemo, useState } from "react";

import { UsButton, UsMonoTag } from "../primitives";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { useSessionSnapshot } from "../state/session-store";
import {
  validationStore,
  useValidationSnapshot,
} from "../state/validation-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import type { KernelValidationPanelConfig } from "./kernel-validation-config";
import { resolveKernelValidationScope } from "./kernel-validation-scope";
import {
  buildKernelValidationViewModel,
  type KernelValidationFilter,
  type KernelValidationItemVm,
} from "./kernel-validation-view-model";

const filters: readonly {
  readonly value: KernelValidationFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "全部" },
  { value: "block", label: "BLOCK" },
  { value: "warn", label: "WARN" },
  { value: "no-issue", label: "无问题" },
  { value: "selection", label: "当前选择" },
];

export function KernelValidationPanel({
  config,
  rootObjectId = null,
}: {
  readonly config: KernelValidationPanelConfig;
  readonly rootObjectId?: string | null;
}) {
  const workspace = useWorkspaceSnapshot();
  const validation = useValidationSnapshot();
  const session = useSessionSnapshot();
  const selection = useSelectionSnapshot();
  const currentSelection = selection.current;
  const [filter, setFilter] = useState<KernelValidationFilter>("all");
  const [expanded, setExpanded] = useState(true);
  const [scopeMode, setScopeMode] = useState<"current" | "all">("current");
  const scope = useMemo(
    () =>
      resolveKernelValidationScope(
        workspace,
        config,
        currentSelection,
        rootObjectId,
      ),
    [config, currentSelection, rootObjectId, workspace],
  );
  const useCurrentScope = scopeMode === "current" && scope !== null;
  const displayObjectTypeCode = config.scopeCanvasViewId
    ? null
    : config.objectTypeCode;
  const vm = useMemo(
    () =>
      buildKernelValidationViewModel({
        workspace,
        results: validation.kernelResults,
        status: validation.kernelStatus,
        error: validation.kernelError,
        filter,
        selection: currentSelection,
        scopeObjectTypeCode: displayObjectTypeCode,
        scopeMembers: useCurrentScope ? scope.members : null,
      }),
    [
      displayObjectTypeCode,
      filter,
      scope,
      currentSelection,
      useCurrentScope,
      validation,
      workspace,
    ],
  );
  const currentScopeVm = useMemo(
    () =>
      scope
        ? buildKernelValidationViewModel({
            workspace,
            results: validation.kernelResults,
            status: validation.kernelStatus,
            error: validation.kernelError,
            filter,
            selection: currentSelection,
            scopeObjectTypeCode: null,
            scopeMembers: scope.members,
          })
        : null,
    [currentSelection, filter, scope, validation, workspace],
  );
  const run = () => {
    if (!config.allowManualRun || validation.kernelRunning) return;
    void validationStore.runKernelCheck(
      session.currentMemberId,
      config.scopeCanvasViewId ? null : config.objectTypeCode,
    );
  };
  const statusNotice = kernelValidationStatusNotice(validation);
  const latestReady =
    validation.kernelStatus === "ready" &&
    !validation.kernelRunning &&
    !validation.kernelStale;

  return (
    <section className="us-kernel-validation" data-position={config.position}>
      <header className="us-kernel-validation__head">
        <button onClick={() => setExpanded((value) => !value)} type="button">
          <strong>规则校验</strong>
          <span>{expanded ? "收起" : "展开"}</span>
        </button>
        <UsMonoTag active>KERNEL</UsMonoTag>
        <span data-tone="danger">{vm.blockCount} BLOCK</span>
        <span data-tone="change">{vm.warnCount} WARN</span>
        <span data-tone="ok">{vm.passCount} PASS</span>
        <span data-tone="neutral">{vm.totalIssueCount} 个问题</span>
        <span data-tone={latestReady && vm.noIssue ? "ok" : "neutral"}>
          {validation.kernelStatus === "idle"
            ? "未校验"
            : validation.kernelStatus === "error"
              ? "失败"
              : validation.kernelStale
                ? "结果过期"
                : latestReady && vm.noIssue
                  ? "无问题"
                  : latestReady
                    ? "已完成"
                    : "校验中"}
        </span>
        {validation.kernelRunAt ? (
          <small className="us-kernel-validation__run-meta">
            {formatKernelRunMeta(
              validation.kernelRunAt,
              validation.kernelScope,
            )}
          </small>
        ) : null}
        {config.allowManualRun ? (
          <UsButton
            disabled={validation.kernelRunning}
            onClick={run}
            size="sm"
            variant="emphasis"
          >
            {validation.kernelRunning ? "校验中…" : "重新校验"}
          </UsButton>
        ) : null}
      </header>
      {statusNotice ? (
        <p className="us-kernel-validation__notice" role="status">
          {statusNotice}
        </p>
      ) : null}
      {scope ? (
        <div className="us-kernel-validation__scope" role="status">
          {useCurrentScope ? (
            <>
              <span>
                当前方案:{scope.label}（{currentScopeVm?.scopeIssueCount ?? 0}{" "}
                条问题）
              </span>
              {(currentScopeVm?.outsideScopeIssueCount ?? 0) > 0 ? (
                <small>
                  全工作空间另有 {currentScopeVm!.outsideScopeIssueCount} 条问题
                </small>
              ) : null}
            </>
          ) : (
            <span>全工作空间（{vm.totalIssueCount} 条问题）</span>
          )}
          <button
            onClick={() =>
              setScopeMode((current) =>
                current === "current" ? "all" : "current",
              )
            }
            type="button"
          >
            {useCurrentScope ? "查看全部" : "查看当前方案"}
          </button>
        </div>
      ) : null}
      {expanded ? (
        <div className="us-kernel-validation__body">
          <nav aria-label="校验结果筛选">
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.value}
                key={item.value}
                onClick={() => setFilter(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
          {vm.error ? (
            <p className="us-kernel-validation__error" role="alert">
              校验失败：{vm.error}。上次成功结果仍保留。
            </p>
          ) : null}
          {vm.items.length > 0 ? (
            <ul className="us-kernel-validation__results">
              {vm.items.map((item) => (
                <ValidationResult key={item.key} result={item} />
              ))}
            </ul>
          ) : (
            <p className="us-kernel-validation__empty" role="status">
              {vm.emptyLabel}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function kernelValidationStatusNotice(validation: {
  readonly kernelRunning: boolean;
  readonly kernelLoading: boolean;
  readonly kernelStale: boolean;
  readonly kernelStatus: "idle" | "running" | "ready" | "error";
}): string | null {
  if (validation.kernelStale && validation.kernelRunning)
    return "数据已变化，正在重新校验…";
  if (validation.kernelStale)
    return "数据已变化，请重新校验；校验结果可能已过期";
  if (validation.kernelLoading) return "正在加载校验结果…";
  if (validation.kernelStatus === "error") return "校验结果加载失败";
  if (validation.kernelRunning) return "正在校验…";
  return null;
}

function formatKernelRunMeta(runAt: string, scope: string | null): string {
  const timestamp = new Date(runAt).toLocaleString("zh-CN");
  return `${timestamp} · ${scope ? `范围 ${scope}` : "全工作空间"}`;
}

function ValidationResult({
  result,
}: {
  readonly result: KernelValidationItemVm;
}) {
  const select = () => {
    if (
      !applyKernelValidationSelection(result, (next) =>
        selectionStore.set(next),
      )
    )
      return;
    document
      .getElementById(`us-row-${result.selection!.entityId}`)
      ?.scrollIntoView({ block: "nearest" });
  };
  return (
    <li data-severity={result.severity} data-state={result.state}>
      <button
        disabled={!result.selection || result.state === "dangling"}
        onClick={select}
        type="button"
      >
        <span>{result.kind === "no-issue" ? "无问题" : result.severity}</span>
        <strong>
          {result.kind === "no-issue"
            ? (result.objectName ?? result.objectCode ?? result.objectId)
            : result.ruleCode}
        </strong>
        <p>
          {result.kind === "no-issue"
            ? `${result.objectCode ?? result.objectId} · ${result.message}`
            : result.message}
        </p>
        {result.fieldCode ? (
          <small>字段：{result.fieldName ?? result.fieldCode}</small>
        ) : null}
        {result.suggestion ? <small>建议：{result.suggestion}</small> : null}
        {result.stateLabel ? <em>{result.stateLabel}</em> : null}
        {result.createdAt ? (
          <small>{new Date(result.createdAt).toLocaleString("zh-CN")}</small>
        ) : null}
      </button>
    </li>
  );
}

export function applyKernelValidationSelection(
  result: KernelValidationItemVm,
  setSelection: (
    selection: NonNullable<KernelValidationItemVm["selection"]>,
  ) => void,
): boolean {
  if (!result.selection || result.state === "dangling") return false;
  setSelection(result.selection);
  return true;
}
