import type { InputHTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";
import { IconSearch } from "./icons";

/**
 * Input:text(白底描边)/ search(米底,搜索图标,可带 ⌘K 提示)。
 * data 态 = 值用 font.data 等宽(一切数值/ID/日期,交接规格 DEV NOTES)。
 */
export interface UsInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  kind?: "text" | "search";
  data?: boolean;
  hotkey?: string;
  prefix?: ReactNode;
  containerClassName?: string;
}

export function UsInput({
  kind = "text",
  data = false,
  hotkey,
  prefix,
  containerClassName,
  disabled,
  ...rest
}: UsInputProps) {
  return (
    <span
      className={cx(
        "us-input",
        kind === "search" && "us-input--search",
        data && "us-input--data",
        disabled && "us-input--disabled",
        containerClassName,
      )}
    >
      {prefix ??
        (kind === "search" ? (
          <span className="us-input__icon">
            <IconSearch size={13} />
          </span>
        ) : null)}
      <input disabled={disabled} {...rest} />
      {hotkey ? <span className="us-input__hotkey">{hotkey}</span> : null}
    </span>
  );
}
