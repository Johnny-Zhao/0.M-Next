import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { RuleGroup } from "./rules";
import { CompareDiff } from "./compare-diff";
import { RuleNav } from "./rule-nav";
import { ValidationCardList } from "./validation-card";
import { useKernelRuntimeState } from "../data/boot-mode";
import { IconSync, UsButton, UsMonoTag, pushToast } from "../primitives";
import { useSessionSnapshot } from "../state/session-store";
import {
  validationStore,
  useValidationSnapshot,
} from "../state/validation-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";

export function ValidateView() {
  const navigate = useNavigate();
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const validation = useValidationSnapshot();
  const kernelRuntime = useKernelRuntimeState();
  const [group, setGroup] = useState<RuleGroup | "全部规则">("全部规则");
  const [selectedRule, setSelectedRule] = useState<string | null>("XSRC-001");
  const [running, setRunning] = useState(false);
  const filtered = useMemo(
    () =>
      group === "全部规则"
        ? validation.results
        : validation.results.filter((result) => result.group === group),
    [group, validation.results],
  );
  const selected =
    validation.results.find((result) => result.ruleCode === selectedRule) ??
    filtered[0] ??
    null;
  const errors = validation.results.filter(
    (result) =>
      result.level === "error" && !validation.ignored.has(result.ruleCode),
  ).length;
  const warnings = validation.results.filter(
    (result) =>
      result.level === "warning" && !validation.ignored.has(result.ruleCode),
  ).length;
  const passed = validation.results.filter(
    (result) =>
      result.level === "passed" && !validation.ignored.has(result.ruleCode),
  ).length;
  const kernelSummary = kernelValidationSummary(validation.kernelResults);
  const runNow = () => {
    setRunning(true);
    validationStore.runAll("0.2s");
    if (kernelRuntime.backend) {
      void validationStore.runKernelCheck(session.currentMemberId);
    }
    window.setTimeout(() => setRunning(false), 360);
  };
  const fix = (ruleCode: string) => {
    const result = validationStore.executeFix(
      ruleCode,
      session.currentMemberId,
    );
    pushToast({ title: result.message });
    if (result.kind === "navigate") navigate(result.href);
  };
  const ignore = (ruleCode: string) => {
    validationStore.ignore(ruleCode, session.currentMemberId);
    pushToast({ title: "已设为例外", desc: "审计记录已写入" });
  };
  return (
    <section className="us-validate">
      <header className="us-validate-head">
        <div>
          <span>统一数据源 › 校验中心</span>
          <UsMonoTag tone="primary">VALIDATE</UsMonoTag>
          <strong>每次写入自动增量校验</strong>
        </div>
        <UsButton
          icon={<IconSync size={13} />}
          onClick={runNow}
          variant="emphasis"
        >
          {running ? "运行中…" : "立即运行"}
        </UsButton>
      </header>
      <div className="us-validate-grid">
        <RuleNav
          active={group}
          ignored={validation.ignored}
          onSelect={setGroup}
          results={validation.results}
        />
        <main className="us-validate-main">
          <header className="us-validate-summary">
            <div>
              <h2>运行结果</h2>
              <UsMonoTag>
                {formatTime(validation.runAt)} · 用时 {validation.durationLabel}
              </UsMonoTag>
            </div>
            <span data-tone="danger">{errors} 错误</span>
            <span data-tone="change">{warnings} 警告</span>
            <span data-tone="ok">{passed} 通过</span>
          </header>
          <ValidationCardList
            ignored={validation.ignored}
            onFix={fix}
            onIgnore={ignore}
            onSelect={setSelectedRule}
            results={filtered}
            selectedRule={selected?.ruleCode ?? null}
          />
          {kernelRuntime.backend ? (
            <section className="us-validationcards" aria-label="内核校验">
              <article
                className="us-validationcard us-validationcard--kernel"
                data-tone={kernelSummary.tone}
              >
                <div className="us-validationcard__summary">
                  <span className="us-validationcard__mark">
                    {kernelSummary.mark}
                  </span>
                  <span>
                    <strong>内核校验(权威)</strong>
                    <small>
                      {validation.kernelRunning
                        ? "运行中"
                        : validation.kernelRunAt
                          ? `${formatTime(validation.kernelRunAt)} · ${validation.kernelResults.length} 命中`
                          : "尚未运行"}
                    </small>
                  </span>
                  <UsMonoTag tone={kernelSummary.tagTone}>
                    {kernelSummary.label}
                  </UsMonoTag>
                </div>
                {validation.kernelResults.length > 0 ? (
                  <ul>
                    {validation.kernelResults.map((result) => (
                      <li
                        key={`${result.ruleCode}-${result.target?.entityId ?? "workspace"}`}
                      >
                        <strong>{result.ruleCode}</strong> · {result.detail}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {validation.kernelRunning
                      ? "正在读取内核校验结果..."
                      : "点击「立即运行」后显示内核权威命中。"}
                  </p>
                )}
              </article>
            </section>
          ) : null}
          <p className="us-validate-foot">
            错误会阻断「生成配置单 / 分享」,修复或设为例外后自动解锁。
            {kernelRuntime.backend ? " 内核 BLOCK 亦会阻断分享。" : ""}
          </p>
        </main>
        <CompareDiff members={workspace.members} rule={selected} />
      </div>
    </section>
  );
}

function formatTime(value: string): string {
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? "10:32";
}

function kernelValidationSummary(
  results: readonly { readonly level: string }[],
): {
  readonly tone: "danger" | "warning" | "neutral";
  readonly tagTone: "danger" | "change" | "primary";
  readonly mark: string;
  readonly label: string;
} {
  if (results.some((result) => result.level === "error")) {
    return {
      tone: "danger",
      tagTone: "danger",
      mark: "!",
      label: "BLOCK",
    };
  }
  if (results.some((result) => result.level === "warning")) {
    return {
      tone: "warning",
      tagTone: "change",
      mark: "!",
      label: "WARN",
    };
  }
  return {
    tone: "neutral",
    tagTone: "primary",
    mark: "✓",
    label: results.length > 0 ? "OK" : "IDLE",
  };
}
