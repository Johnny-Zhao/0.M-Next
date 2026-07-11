import type { ReactNode } from "react";

import { cx } from "./cx";

/**
 * SyncDot — 同步状态灯:青绿=已同步 · 琥珀=刚变更/待确认 · 砖红=冲突/悬空 · 灰=离线。
 * 规则:状态色永远伴随文字(设计系统 §03),故 children 必填。
 */
export type UsSyncState = "ok" | "change" | "danger" | "offline";

export function UsSyncDot({
  state,
  children,
  className,
}: {
  state: UsSyncState;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("us-syncdot", `us-syncdot--${state}`, className)}>
      {children}
    </span>
  );
}
