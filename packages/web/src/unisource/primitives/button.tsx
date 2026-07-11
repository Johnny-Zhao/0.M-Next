import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

/**
 * Button(设计系统 §02):
 * primary 青绿 / emphasis 墨 / secondary 描边 / danger 砖红(仅全库动作)/ ghost 绿字。
 * hover 加深、disabled 40%。
 */
export type UsButtonVariant =
  | "primary"
  | "emphasis"
  | "secondary"
  | "danger"
  | "ghost";

export interface UsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UsButtonVariant;
  size?: "md" | "sm";
  icon?: ReactNode;
}

export function UsButton({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  type,
  ...rest
}: UsButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cx(
        "us-btn",
        `us-btn--${variant}`,
        size === "sm" && "us-btn--sm",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
