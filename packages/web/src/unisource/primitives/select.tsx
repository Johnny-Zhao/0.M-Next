import type { SelectHTMLAttributes } from "react";

import { cx } from "./cx";

export interface UsSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
}

export function UsSelect({
  containerClassName,
  disabled,
  ...rest
}: UsSelectProps) {
  return (
    <span
      className={cx(
        "us-select",
        disabled && "us-select--disabled",
        containerClassName,
      )}
    >
      <select disabled={disabled} {...rest} />
    </span>
  );
}
