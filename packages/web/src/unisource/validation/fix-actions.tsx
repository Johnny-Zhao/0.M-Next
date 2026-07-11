import { UsButton } from "../primitives";
import type { RuleOutcome } from "./rules";

export function FixActions({
  rule,
  onFix,
  onIgnore,
}: {
  readonly rule: RuleOutcome;
  readonly onFix: (ruleCode: string) => void;
  readonly onIgnore: (ruleCode: string) => void;
}) {
  if (rule.fixes.length === 0) return null;
  return (
    <div className="us-fixactions">
      {rule.fixes.map((fix) => {
        const click =
          fix.id === "ignore"
            ? () => onIgnore(rule.ruleCode)
            : () => onFix(rule.ruleCode);
        return (
          <UsButton
            key={fix.id}
            onClick={click}
            size="sm"
            variant={fix.tone === "primary" ? "primary" : "secondary"}
          >
            {fix.label}
          </UsButton>
        );
      })}
    </div>
  );
}
