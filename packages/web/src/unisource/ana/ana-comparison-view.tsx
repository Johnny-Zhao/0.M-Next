import { UsButton } from "../primitives";
import type {
  AnaComparisonIssue,
  AnaComparisonRow,
  AnaComparisonVm,
} from "./ana-comparison";

interface Props {
  readonly comparison: AnaComparisonVm;
  readonly activePlanId: string | null;
  readonly onSelectPlan: (row: AnaComparisonRow) => void;
  readonly onSelectIssue: (issue: AnaComparisonIssue) => void;
}

export function AnaComparisonView({
  comparison,
  activePlanId,
  onSelectPlan,
  onSelectIssue,
}: Props) {
  const issues = activePlanId
    ? comparison.issues.filter((issue) =>
        issue.planObjectIds.includes(activePlanId),
      )
    : comparison.issues;
  return (
    <>
      <section className="us-ana-card" aria-label="分析摘要">
        <header>
          <span>方案校验摘要</span>
          <strong>来自最近一次内核校验</strong>
        </header>
        <div className="us-ana-factors">
          <Summary label="方案数量" value={comparison.summary.total} />
          <Summary label="通过" value={comparison.summary.ok} />
          <Summary label="有阻断" value={comparison.summary.block} />
          <Summary label="有警告" value={comparison.summary.warn} />
        </div>
      </section>
      <ComparisonState state={comparison.state} />
      <ComparisonTable
        comparison={comparison}
        activePlanId={activePlanId}
        onSelectPlan={onSelectPlan}
      />
      <IssueList issues={issues} onSelectIssue={onSelectIssue} />
    </>
  );
}

function Summary({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="us-ana-factor">
      <span>{label}</span>
      <strong className="us-data">{value}</strong>
    </div>
  );
}

function ComparisonState({
  state,
}: {
  readonly state: AnaComparisonVm["state"];
}) {
  const message = {
    "no-plans": "当前工作空间暂无采购方案",
    "missing-derived": "方案派生数据尚未生成",
    unvalidated: "当前方案尚未完成校验",
    ready: null,
  }[state];
  return message ? <p role="status">{message}</p> : null;
}

function ComparisonTable({
  comparison,
  activePlanId,
  onSelectPlan,
}: Pick<Props, "comparison" | "activePlanId" | "onSelectPlan">) {
  return (
    <section className="us-ana-card">
      <header>
        <span>方案对比</span>
        <strong>字段值来自当前工作空间</strong>
      </header>
      <table className="us-ana-table">
        <thead>
          <tr>
            {comparison.columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
            <th>校验状态</th>
            <th>风险数量</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr
              aria-selected={row.objectId === activePlanId}
              key={row.objectId}
              onClick={() => onSelectPlan(row)}
            >
              {comparison.columns.map((column) => (
                <td className="us-data" key={column.key}>
                  {row.values[column.key] ?? "当前数据未提供"}
                </td>
              ))}
              <td>{statusLabel(row.status)}</td>
              <td className="us-data">{row.issueCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function IssueList({
  issues,
  onSelectIssue,
}: Pick<Props, "onSelectIssue"> & {
  readonly issues: readonly AnaComparisonIssue[];
}) {
  return (
    <section className="us-ana-card us-ana-insights">
      <header>
        <span>风险下钻</span>
        <strong>后端规则结果</strong>
      </header>
      {issues.length === 0 ? (
        <p role="status">当前范围没有 BLOCK 或 WARN</p>
      ) : (
        issues.map((issue) => (
          <article
            key={`${issue.ruleCode}-${issue.selection?.entityId ?? "dangling"}`}
          >
            <h2>
              {issue.ruleCode} · {issue.level === "BLOCK" ? "阻断" : "警告"}
            </h2>
            <p>
              {issue.title}：{issue.detail}
            </p>
            {issue.state === "dangling" ? (
              <p role="status">关联对象不可用</p>
            ) : (
              <UsButton
                onClick={() => onSelectIssue(issue)}
                size="sm"
                variant="secondary"
              >
                定位关联对象
              </UsButton>
            )}
          </article>
        ))
      )}
    </section>
  );
}

function statusLabel(status: AnaComparisonRow["status"]): string {
  return {
    ok: "通过",
    block: "有阻断",
    warn: "有警告",
    unchecked: "未完成校验",
  }[status];
}
