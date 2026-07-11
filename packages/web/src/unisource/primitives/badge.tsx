import type { ReactNode } from "react";

import { cx } from "./cx";

/** StatusPill — 数据枚举值(在售/预售/研发中/停产)。色义锁定,不得混用。 */
export type UsPillTone = "sale" | "presale" | "dev" | "eol";

export function UsStatusPill({
  tone,
  children,
  className,
}: {
  tone: UsPillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("us-pill", `us-pill--${tone}`, className)}>
      {children}
    </span>
  );
}

/** DiffBadge — 对数据源的 diff 动作:增(青绿)/改(琥珀)/删(砖红)/跳过(灰),方角。 */
export type UsDiffOp = "add" | "change" | "delete" | "skip";

const DIFF_LABEL: Record<UsDiffOp, string> = {
  add: "增",
  change: "改",
  delete: "删",
  skip: "跳过",
};

export function UsDiffBadge({
  op,
  className,
}: {
  op: UsDiffOp;
  className?: string;
}) {
  return (
    <span className={cx("us-diff", `us-diff--${op}`, className)}>
      {DIFF_LABEL[op]}
    </span>
  );
}

/** MonoTag — 等宽小标签(描述形式 GRID/DOC/BI…);active=墨底金字。 */
export function UsMonoTag({
  active = false,
  tone,
  children,
  className,
}: {
  active?: boolean;
  tone?: "primary" | "change";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "us-monotag",
        active && "us-monotag--active",
        tone && `us-monotag--${tone}`,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** AiBadge — 「AI 改」标记。 */
export function UsAiBadge({ className }: { className?: string }) {
  return <span className={cx("us-aibadge", className)}>AI 改</span>;
}
