import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

/** Panel — 白卡容器(card 10px / panel 8px 圆角),可选头部(标题 + mono kicker + extra)。 */
export interface UsPanelProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  kicker?: ReactNode;
  extra?: ReactNode;
  flat?: boolean;
  shadow?: boolean;
  bodyClassName?: string;
}

export function UsPanel({
  title,
  kicker,
  extra,
  flat = false,
  shadow = false,
  bodyClassName,
  className,
  children,
  ...rest
}: UsPanelProps) {
  return (
    <div
      className={cx(
        "us-panel",
        flat && "us-panel--flat",
        shadow && "us-panel--shadow",
        className,
      )}
      {...rest}
    >
      {title || kicker || extra ? (
        <div className="us-panel__header">
          {title ? <span className="us-panel__title">{title}</span> : null}
          {kicker ? <span className="us-panel__kicker">{kicker}</span> : null}
          {extra ? <span className="us-panel__extra">{extra}</span> : null}
        </div>
      ) : null}
      <div className={cx("us-panel__body", bodyClassName)}>{children}</div>
    </div>
  );
}
