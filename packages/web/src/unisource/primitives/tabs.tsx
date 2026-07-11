import type { ReactNode } from "react";

import { cx } from "./cx";

export interface UsTabItem {
  key: string;
  label: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  items: UsTabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  "aria-label"?: string;
}

/** SegmentedControl — 胶囊型互斥切换(WHAT/DATA、网络:正常/弱网…)。 */
export function UsSegmented({
  items,
  value,
  onChange,
  className,
  ...rest
}: TabsProps) {
  return (
    <div role="tablist" className={cx("us-seg", className)} {...rest}>
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          type="button"
          aria-selected={it.key === value}
          disabled={it.disabled}
          className="us-seg__item"
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** UnderlineTabs — 面板内页签(属性/样式/版本),右侧可带 mono 备注。 */
export function UsUnderlineTabs({
  items,
  value,
  onChange,
  aside,
  className,
  ...rest
}: TabsProps & { aside?: ReactNode }) {
  return (
    <div role="tablist" className={cx("us-tabs", className)} {...rest}>
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          type="button"
          aria-selected={it.key === value}
          disabled={it.disabled}
          className="us-tabs__item"
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
      {aside ? <span className="us-tabs__aside">{aside}</span> : null}
    </div>
  );
}
