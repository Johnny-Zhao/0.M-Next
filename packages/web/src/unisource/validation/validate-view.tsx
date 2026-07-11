import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { RuleGroup } from "./rules";
import { CompareDiff } from "./compare-diff";
import { RuleNav } from "./rule-nav";
import { ValidationCardList } from "./validation-card";
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
  const runNow = () => {
    setRunning(true);
    validationStore.runAll("0.2s");
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
          <p className="us-validate-foot">
            错误会阻断「生成配置单 / 分享」,修复或设为例外后自动解锁。
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
