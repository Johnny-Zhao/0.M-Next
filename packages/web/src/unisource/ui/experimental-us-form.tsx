import { Alert, Button, Form, Input } from "antd";

export interface ExperimentalUsFormProps {
  readonly value: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onValueChange: (value: string) => void;
  readonly onSubmit: () => void;
}

/** Controlled form adapter for the preview-only folder creation verification. */
export function ExperimentalUsForm({
  value,
  saving,
  error,
  onValueChange,
  onSubmit,
}: ExperimentalUsFormProps) {
  return (
    <Form layout="vertical" onFinish={onSubmit} requiredMark={false}>
      <Form.Item
        help={error}
        label="文件夹名称"
        required
        validateStatus={error ? "error" : undefined}
      >
        <Input
          autoFocus
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder="例如：采购资料"
          value={value}
        />
      </Form.Item>
      {error?.includes("后端") ? <Alert message={error} type="error" /> : null}
      <Button htmlType="submit" loading={saving} type="primary">
        保存文件夹
      </Button>
    </Form>
  );
}
