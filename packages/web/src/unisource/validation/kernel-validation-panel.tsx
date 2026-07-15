import { useMemo, useState } from "react";

import type { ExpressionGridValidationConfig } from "../grid/expression-grid-view-model";
import { UsButton, UsMonoTag } from "../primitives";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { useSessionSnapshot } from "../state/session-store";
import {
  validationStore,
  useValidationSnapshot,
} from "../state/validation-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
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
}: {
  readonly config: ExpressionGridValidationConfig;
}) {
  const workspace = useWorkspaceSnapshot();
  const validation = useValidationSnapshot();
  const session = useSessionSnapshot();
  const selection = useSelectionSnapshot();
  const [filter, setFilter] = useState<KernelValidationFilter>("all");
  const [expanded, setExpanded] = useState(true);
  const vm = useMemo(
    () =>
      buildKernelValidationViewModel({
        workspace,
        results: validation.kernelResults,
        status: validation.kernelStatus,
        error: validation.kernelError,
        filter,
        selection: selection.current,
        scopeObjectTypeCode: config.objectTypeCode,
      }),
    [config.objectTypeCode, filter, selection, validation, workspace],
  );
  const run = () => {
    if (!config.allowManualRun || validation.kernelRunning) return;
    void validationStore.runKernelCheck(
      session.currentMemberId,
      config.objectTypeCode,
    );
  };

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
        <span data-tone={vm.noIssue ? "ok" : "neutral"}>
          {validation.kernelStatus === "idle"
            ? "未校验"
            : vm.noIssue
              ? "无问题"
              : validation.kernelStatus === "ready"
                ? "已完成"
                : validation.kernelStatus === "error"
                  ? "失败"
                  : "运行中"}
        </span>
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
