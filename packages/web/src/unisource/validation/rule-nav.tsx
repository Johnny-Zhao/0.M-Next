import type { RuleGroup, RuleOutcome } from "./rules";

const groups: readonly (RuleGroup | "全部规则")[] = [
  "全部规则",
  "字段约束",
  "跨源一致性",
  "引用完整性",
  "模板约束",
];

export function RuleNav({
  active,
  ignored,
  results,
  onSelect,
}: {
  readonly active: RuleGroup | "全部规则";
  readonly ignored: ReadonlySet<string>;
  readonly results: readonly RuleOutcome[];
  readonly onSelect: (group: RuleGroup | "全部规则") => void;
}) {
  return (
    <aside className="us-validate-nav">
      <header>
        <span>规则组</span>
        <strong>RULES</strong>
      </header>
      <div className="us-validate-nav__items">
        {groups.map((group) => {
          const items =
            group === "全部规则"
              ? results
              : results.filter((result) => result.group === group);
          const tone = groupTone(items, ignored);
          return (
            <button
              aria-pressed={active === group}
              className="us-validate-nav__item"
              data-tone={tone}
              key={group}
              onClick={() => onSelect(group)}
              type="button"
            >
              <span>{group}</span>
              <strong>{items.length}</strong>
            </button>
          );
        })}
      </div>
      <button className="us-validate-nav__new" type="button">
        + 新建规则
      </button>
      <p>规则跟随数据源变化自动重算,错误会阻断分享。</p>
    </aside>
  );
}

function groupTone(
  results: readonly RuleOutcome[],
  ignored: ReadonlySet<string>,
): "danger" | "change" | "ok" {
  if (
    results.some(
      (result) => result.level === "error" && !ignored.has(result.ruleCode),
    )
  )
    return "danger";
  if (
    results.some(
      (result) => result.level === "warning" && !ignored.has(result.ruleCode),
    )
  )
    return "change";
  return "ok";
}
