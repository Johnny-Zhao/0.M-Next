import { useEffect, useState } from "react";

import type {
  DataObject,
  FieldDef,
  ObjectTypeDef,
  RelationType,
} from "../model/kernel";
import { UsButton, UsInput, UsModal, UsSelect, pushToast } from "../primitives";
import {
  createRecord,
  initialRecordDraft,
  updateRecord,
  type CreateRecordDraft,
} from "./create-record-action";
import { useWorkspaceSnapshot } from "../state/workspace-store";

export function CreateRecordDialog({
  objectType,
  relationTypes,
  open,
  onClose,
  onCreated,
}: {
  readonly objectType: ObjectTypeDef;
  readonly relationTypes: readonly RelationType[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (objectId: string) => void;
}) {
  return (
    <RecordEditorDialog
      mode="create"
      objectType={objectType}
      onClose={onClose}
      onCreated={onCreated}
      open={open}
      relationTypes={relationTypes}
    />
  );
}

export function EditRecordDialog({
  object,
  objectType,
  open,
  onClose,
  onUpdated,
}: {
  readonly object: DataObject;
  readonly objectType: ObjectTypeDef;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onUpdated: () => void;
}) {
  return (
    <RecordEditorDialog
      mode="edit"
      object={object}
      objectType={objectType}
      onClose={onClose}
      onUpdated={onUpdated}
      open={open}
      relationTypes={[]}
    />
  );
}

function RecordEditorDialog({
  mode,
  object,
  objectType,
  relationTypes,
  open,
  onClose,
  onCreated,
  onUpdated,
}: {
  readonly mode: "create" | "edit";
  readonly object?: DataObject;
  readonly objectType: ObjectTypeDef;
  readonly relationTypes: readonly RelationType[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated?: (objectId: string) => void;
  readonly onUpdated?: () => void;
}) {
  const workspace = useWorkspaceSnapshot();
  const [draft, setDraft] = useState<CreateRecordDraft>(() =>
    initialRecordDraft(objectType, object),
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(initialRecordDraft(objectType, object));
    setErrors({});
    setMessage(null);
  }, [object, objectType, open]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    if (mode === "edit" && !object) {
      setSaving(false);
      setMessage("未找到要编辑的记录。");
      return;
    }
    const result =
      mode === "edit"
        ? updateRecord({
            objectType,
            object: object!,
            draft,
            objects: workspace.objects,
          })
        : await createRecord({ objectType, relationTypes, draft });
    setSaving(false);
    if (result.state === "created") {
      onCreated?.(result.objectId);
      onClose();
      return;
    }
    if (result.state === "updated") {
      pushToast({
        title:
          result.queued > 0 ? "已提交审批" : `已更新 ${result.changed} 个字段`,
        desc: result.queued > 0 ? "等待管理员确认" : "数据源记录已更新",
      });
      onUpdated?.();
      onClose();
      return;
    }
    if (result.state === "invalid") {
      setErrors(result.errors);
      return;
    }
    setMessage(result.message);
  };

  return (
    <UsModal
      footer={
        <>
          <UsButton disabled={saving} onClick={onClose} size="sm">
            取消
          </UsButton>
          <UsButton
            disabled={saving}
            onClick={() => void save()}
            variant="primary"
          >
            {saving ? "正在保存…" : mode === "edit" ? "保存修改" : "创建记录"}
          </UsButton>
        </>
      }
      onClose={onClose}
      open={open}
      title={`${mode === "edit" ? "编辑记录" : "新建记录"} · ${objectType.name}`}
    >
      <form
        className="us-create-record-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {objectType.fields
          .filter((field) => !field.computed && !field.readOnly)
          .map((field) => {
            const error = errors[field.code];
            const value = draft[field.code];
            const unavailable =
              field.dataType === "enum" &&
              (!field.enumValues || field.enumValues.length === 0);
            return (
              <label
                className="us-create-record-form__field"
                data-error={error ? true : undefined}
                key={field.code}
              >
                <span>{`${field.name}${field.required ? " *" : ""}`}</span>
                <CreateRecordField
                  disabled={saving || unavailable}
                  field={field}
                  onChange={(next) =>
                    setDraft((current) => ({ ...current, [field.code]: next }))
                  }
                  value={value}
                />
                {unavailable ? (
                  <small className="us-create-record-form__error">
                    字段配置不可用
                  </small>
                ) : null}
                {error ? (
                  <small className="us-create-record-form__error" role="alert">
                    {error}
                  </small>
                ) : null}
              </label>
            );
          })}
        {message ? (
          <p className="us-create-record-form__message" role="alert">
            {message}
          </p>
        ) : null}
      </form>
    </UsModal>
  );
}

function CreateRecordField({
  field,
  value,
  disabled,
  onChange,
}: {
  readonly field: FieldDef;
  readonly value: string | boolean | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: string | boolean) => void;
}) {
  if (field.dataType === "boolean") {
    return (
      <span className="us-checkbox">
        <input
          aria-label={field.name}
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
      </span>
    );
  }
  if (field.dataType === "enum") {
    return (
      <UsSelect
        aria-label={field.name}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">请选择</option>
        {(field.enumValues ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </UsSelect>
    );
  }
  return (
    <UsInput
      autoComplete="off"
      aria-label={field.name}
      data={field.dataType === "number" || field.dataType === "date"}
      disabled={disabled}
      inputMode={field.dataType === "number" ? "decimal" : undefined}
      onChange={(event) => onChange(event.currentTarget.value)}
      type={field.dataType === "date" ? "date" : "text"}
      value={typeof value === "string" ? value : ""}
    />
  );
}
