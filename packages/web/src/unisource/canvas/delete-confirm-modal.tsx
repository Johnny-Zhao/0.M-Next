import { useEffect, useState } from "react";

import { UsButton, UsInput, UsModal } from "../primitives";

export function DeleteObjectConfirmModal({
  open,
  objectName,
  impact,
  onClose,
  onConfirm,
}: {
  open: boolean;
  objectName: string;
  impact: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const unlocked = typed.trim() === objectName;

  return (
    <UsModal
      open={open}
      onClose={onClose}
      title="删除数据源记录"
      footer={
        <>
          <UsButton variant="secondary" onClick={onClose}>
            取消
          </UsButton>
          <UsButton variant="danger" disabled={!unlocked} onClick={onConfirm}>
            确认删除
          </UsButton>
        </>
      }
    >
      <div className="us-delete-modal">
        <p>
          删除会移除该记录、相关关系，并将文档中的字段引用标记为失效。
          此操作只影响 Mock 工作区，不会调用后端。
        </p>
        <p className="us-delete-modal__impact">{impact}</p>
        <label className="us-delete-modal__label">
          输入 <strong>{objectName}</strong> 解锁删除
          <UsInput
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={objectName}
          />
        </label>
      </div>
    </UsModal>
  );
}
