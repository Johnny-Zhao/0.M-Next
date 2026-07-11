import type { Member } from "../model/view-layer";
import { UsMonoTag } from "../primitives";
import type { CellRef, RuleOutcome } from "./rules";

export function CompareDiff({
  members,
  rule,
}: {
  readonly members: readonly Member[];
  readonly rule: RuleOutcome | null;
}) {
  if (!rule) return null;
  return (
    <aside className="us-validatedetail">
      <header>
        <span>{rule.ruleCode} · 详情</span>
        <UsMonoTag>DETAIL</UsMonoTag>
      </header>
      <p>{rule.detail}</p>
      {rule.compare ? (
        <div className="us-compare">
          <CompareCell
            cell={rule.compare.authoritative}
            members={members}
            tone="ok"
          />
          <CompareCell
            cell={rule.compare.cached}
            members={members}
            tone="bad"
          />
        </div>
      ) : (
        <div className="us-compare us-compare--single">
          <strong>引用信息</strong>
          <span>{rule.target?.fieldCode ?? rule.target?.entityId}</span>
        </div>
      )}
      <section>
        <h3>影响范围 · IMPACT</h3>
        <ul>
          {rule.impact.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <p className="us-validatedetail__foot">
        修复动作即数据源写入,走同一套权限与同步管线。
      </p>
    </aside>
  );
}

function CompareCell({
  cell,
  members,
  tone,
}: {
  readonly cell: CellRef;
  readonly members: readonly Member[];
  readonly tone: "ok" | "bad";
}) {
  const member = members.find((candidate) => candidate.id === cell.updatedBy);
  return (
    <div className="us-compare__cell" data-tone={tone}>
      <small>{cell.sourceLabel}</small>
      <strong>¥{cell.value}</strong>
      <span>
        {formatTime(cell.updatedAt)} · {member?.name ?? cell.updatedBy}
      </span>
    </div>
  );
}

function formatTime(value: string): string {
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? "未记录";
}
