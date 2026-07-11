import { FixActions } from "./fix-actions";
import type { RuleOutcome } from "./rules";

export function ValidationCardList({
  ignored,
  results,
  selectedRule,
  onFix,
  onIgnore,
  onSelect,
}: {
  readonly ignored: ReadonlySet<string>;
  readonly results: readonly RuleOutcome[];
  readonly selectedRule: string | null;
  readonly onFix: (ruleCode: string) => void;
  readonly onIgnore: (ruleCode: string) => void;
  readonly onSelect: (ruleCode: string) => void;
}) {
  const active = results.filter(
    (result) => result.level !== "passed" || ignored.has(result.ruleCode),
  );
  const passed = results.filter(
    (result) => result.level === "passed" && !ignored.has(result.ruleCode),
  );
  return (
    <div className="us-validationcards">
      {active.map((result) => (
        <article
          className="us-validationcard"
          data-ignored={ignored.has(result.ruleCode)}
          data-selected={selectedRule === result.ruleCode}
          data-tone={result.level}
          key={result.ruleCode}
        >
          <button onClick={() => onSelect(result.ruleCode)} type="button">
            <span className="us-validationcard__mark">
              {ignored.has(result.ruleCode)
                ? "·"
                : result.level === "error"
                  ? "!"
                  : "⚠"}
            </span>
            <span>
              <strong>{result.title}</strong>
              <small>
                {result.group} · {result.ruleCode}
              </small>
            </span>
          </button>
          <p>{result.detail}</p>
          {ignored.has(result.ruleCode) ? (
            <em>已忽略 · 审计已记录</em>
          ) : (
            <FixActions onFix={onFix} onIgnore={onIgnore} rule={result} />
          )}
        </article>
      ))}
      {passed.length > 0 ? (
        <details className="us-validationpassed">
          <summary>{passed.length} 项规则通过</summary>
          <ul>
            {passed.map((result) => (
              <li key={result.ruleCode}>
                <span>✓</span>
                {result.ruleCode} · {result.title}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
