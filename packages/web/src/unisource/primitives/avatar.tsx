import type { ReactNode } from "react";

import { cx } from "./cx";

/**
 * Avatar — 成员头像;色板锁定(交接规格 03 color.avatar.*):
 * 王芸=wang 李晓=li 陈默=chen 周然=zhou 同源AI=ai(墨底金字)。
 */
export type UsMember = "wang" | "li" | "chen" | "zhou" | "ai";

export function UsAvatar({
  member,
  label,
  size = "md",
  title,
  className,
}: {
  member: UsMember;
  label: ReactNode;
  size?: "md" | "sm";
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cx("us-avatar", size === "sm" && "us-avatar--sm", className)}
      data-member={member}
      title={title}
    >
      {label}
    </span>
  );
}

export function UsAvatarGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx("us-avatar-group", className)}>{children}</span>;
}
