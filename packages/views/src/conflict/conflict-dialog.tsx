import type { ReactElement } from "react";

import type { ConflictField } from "../api/command-client";

export interface ConflictDialogProps {
  readonly fields: readonly ConflictField[];
  readonly onClose: () => void;
}

export function ConflictDialog({
  fields,
  onClose,
}: ConflictDialogProps): ReactElement {
  return (
    <aside aria-label="字段已被他人修改" role="dialog">
      <h2>字段已被他人修改</h2>
      {fields.map((field) => (
        <section key={field.fieldDefCode}>
          <strong>{field.fieldDefCode}</strong>
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
      <button onClick={onClose} type="button">
        取消
      </button>
    </aside>
  );
}
