import type { ReactElement } from "react";

import type { ConflictField } from "../api/command-client";
import { fieldLabel } from "../display-labels";

export interface ConflictDialogProps {
  readonly fields: readonly ConflictField[];
  readonly onConfirm: (
    choices: Readonly<Record<string, "mine" | "current">>,
  ) => void;
  readonly onClose: () => void;
}

export function ConflictDialog({
  fields,
  onConfirm,
  onClose,
}: ConflictDialogProps): ReactElement {
  return (
    <form aria-label="字段已被他人修改" role="dialog">
      <h2>字段已被他人修改</h2>
      {fields.map((field) => (
        <section key={field.fieldDefCode}>
          <strong>{fieldLabel(field.fieldDefCode)}</strong>
          <p>你的值: {String(field.yourValue)}</p>
          <p>当前值: {String(field.currentValue)}</p>
          <p>
            修改人: {field.changedBy} 时间: {field.changedAt}
          </p>
          <label>
            <input
              defaultChecked
              name={field.fieldDefCode}
              type="radio"
              value="current"
            />
            采用当前值
          </label>
          <label>
            <input name={field.fieldDefCode} type="radio" value="mine" />
            采用我的值
          </label>
        </section>
      ))}
      <button
        onClick={(event) => {
          const choices = Object.fromEntries(
            new FormData(event.currentTarget.form ?? undefined),
          );
          onConfirm(choices as Readonly<Record<string, "mine" | "current">>);
        }}
        type="button"
      >
        确认
      </button>
      <button onClick={onClose} type="button">
        取消
      </button>
    </form>
  );
}
