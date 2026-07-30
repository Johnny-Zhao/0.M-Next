import { Modal } from "antd";
import type { ReactNode } from "react";

export interface ExperimentalUsModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly onClose: () => void;
}

/** Modal adapter deliberately exposes no Ant Design instance or prop types. */
export function ExperimentalUsModal({
  open,
  title,
  children,
  footer,
  onClose,
}: ExperimentalUsModalProps) {
  return (
    <Modal
      footer={footer}
      getContainer={() =>
        document.querySelector(".us-ant-provider") ?? document.body
      }
      onCancel={onClose}
      open={open}
      title={title}
    >
      {children}
    </Modal>
  );
}
