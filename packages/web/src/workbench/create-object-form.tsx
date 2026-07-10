import { useState, type CSSProperties, type ReactElement } from "react";

import type {
  CommandClient,
  ObjectType,
  RelationType,
  ViewObject,
} from "@m-next/views";

import { useToast } from "../toast";
import type { WorkbenchPanelId } from "./workbench";
import { useWorkbenchContext } from "./workbench";

export type CreateObjectKind =
  | "system"
  | "module"
  | "interface"
  | "requirement";

export interface SystemFormValues {
  readonly name: string;
  readonly responsibility: string;
}

export interface ModuleFormValues {
  readonly name: string;
  readonly responsibility: string;
  readonly power_w: string;
}

export interface RequirementFormValues {
  readonly code: string;
  readonly text: string;
  readonly priority: string;
}

export interface InterfaceFormValues {
  readonly name: string;
  readonly direction: string;
  readonly protocol: string;
  readonly data: string;
}

export type CreateObjectFormValues =
  | { readonly kind: "system"; readonly values: SystemFormValues }
  | { readonly kind: "module"; readonly values: ModuleFormValues }
  | { readonly kind: "interface"; readonly values: InterfaceFormValues }
  | { readonly kind: "requirement"; readonly values: RequirementFormValues };

export interface FormValidationResult {
  readonly ok: boolean;
  readonly message: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

interface CreateObjectFormProps {
  readonly onOpenPanel: (panelId: WorkbenchPanelId) => void;
}

type CreateObjectFormKind = "module" | "requirement";

interface CreateObjectViewClient {
  objectTypes(workspaceId: string): Promise<readonly ObjectType[]>;
  relationTypes(workspaceId: string): Promise<readonly RelationType[]>;
  objects(
    workspaceId: string,
    objectType: string,
    page: number,
    pageSize: number,
  ): Promise<{ readonly items: readonly ViewObject[] }>;
}

interface CreateObjectCommandClient {
  createObject: CommandClient["createObject"];
  createRelation: CommandClient["createRelation"];
}

const pageSize = 100;
const resolveAttempts = 6;
const resolveDelayMs = 250;

const emptyModuleValues: ModuleFormValues = {
  name: "",
  responsibility: "",
  power_w: "0",
};

const containsRelationByKind: Partial<Record<CreateObjectKind, string>> = {
  system: "proposal_contains_system",
  module: "proposal_contains_module",
};

const emptyRequirementValues: RequirementFormValues = {
  code: "",
  text: "",
  priority: "",
};

const popoverStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  minWidth: "18rem",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
};

const inputStyle: CSSProperties = {
  background: "var(--mn-surface)",
  border: "1px solid var(--mn-border-2)",
  borderRadius: 5,
  color: "var(--mn-ink)",
  padding: "0.35rem 0.45rem",
};

const actionStyle: CSSProperties = {
  display: "flex",
  gap: "0.4rem",
  justifyContent: "flex-end",
};

export function findObjectTypeId(
  objectTypes: readonly ObjectType[],
  code: string,
): string | null {
  return (
    objectTypes.find((type) => type.code === code || type.id === code)?.id ??
    null
  );
}

export function findRelationTypeId(
  relationTypes: readonly RelationType[],
  code: string,
): string | null {
  return (
    relationTypes.find((type) => type.code === code || type.id === code)?.id ??
    null
  );
}

export function validateCreateObjectForm(
  form: CreateObjectFormValues,
): FormValidationResult {
  if (form.kind === "system") return validateSystemForm(form.values);
  if (form.kind === "module") return validateModuleForm(form.values);
  if (form.kind === "interface") return validateInterfaceForm(form.values);
  return validateRequirementForm(form.values);
}

export async function createTechnicalObject(params: {
  readonly viewClient: CreateObjectViewClient;
  readonly commandClient: CreateObjectCommandClient;
  readonly workspaceId: string;
  readonly rootId: string;
  readonly form: CreateObjectFormValues;
  readonly attempts?: number;
  readonly delay?: (ms: number) => Promise<void>;
}): Promise<{
  readonly objectId: string | null;
  readonly kind: CreateObjectKind;
}> {
  const validation = validateCreateObjectForm(params.form);
  if (!validation.ok || !validation.fields) throw new Error(validation.message);
  const containsRelationCode = containsRelationByKind[params.form.kind];
  if (containsRelationCode && !params.rootId.trim()) {
    throw new Error("方案根尚未就绪，请稍后重试");
  }
  const objectTypes = await params.viewClient.objectTypes(params.workspaceId);
  const objectTypeId = findObjectTypeId(objectTypes, params.form.kind);
  if (!objectTypeId)
    throw new Error(`当前模板不支持${kindLabel(params.form.kind)}`);
  const existing = await params.viewClient.objects(
    params.workspaceId,
    params.form.kind,
    0,
    pageSize,
  );
  const knownIds = new Set(existing.items.map((item) => item.objectId));
  await params.commandClient.createObject(
    params.workspaceId,
    objectTypeId,
    validation.fields,
    "DRAFT",
  );
  const objectId = await resolveCreatedObjectId({
    viewClient: params.viewClient,
    workspaceId: params.workspaceId,
    objectType: params.form.kind,
    knownIds,
    attempts: params.attempts ?? resolveAttempts,
    delay: params.delay ?? delay,
  });
  if (containsRelationCode && objectId) {
    const relationTypes = await params.viewClient.relationTypes(
      params.workspaceId,
    );
    const relationTypeId = findRelationTypeId(
      relationTypes,
      containsRelationCode,
    );
    if (!relationTypeId) throw new Error("当前模板不支持方案包含模块关系");
    await params.commandClient.createRelation(
      params.workspaceId,
      relationTypeId,
      params.rootId,
      objectId,
      "create-object-form",
    );
  }
  return { objectId, kind: params.form.kind };
}

export function CreateObjectForm({
  onOpenPanel,
}: CreateObjectFormProps): ReactElement | null {
  const context = useWorkbenchContext();
  const toast = useToast();
  const [activeKind, setActiveKind] = useState<CreateObjectFormKind | null>(
    null,
  );
  const [moduleValues, setModuleValues] =
    useState<ModuleFormValues>(emptyModuleValues);
  const [requirementValues, setRequirementValues] =
    useState<RequirementFormValues>(emptyRequirementValues);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (context.templateCode !== "technical_proposal") return null;

  async function submit(kind: CreateObjectFormKind): Promise<void> {
    const form: CreateObjectFormValues =
      kind === "module"
        ? { kind, values: moduleValues }
        : { kind, values: requirementValues };
    const validation = validateCreateObjectForm(form);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const result = await createTechnicalObject({
        viewClient: context.viewClient,
        commandClient: context.commandClient,
        workspaceId: context.workspaceId,
        rootId: context.rootId,
        form,
      });
      context.refreshViews();
      window.setTimeout(context.refreshViews, 400);
      if (result.objectId) {
        context.selection.select({
          entityType: "object",
          entityId: result.objectId,
        });
      }
      onOpenPanel(kind === "module" ? "diagram" : "matrix");
      toast.success(`${kindLabel(kind)}已创建`);
      setActiveKind(null);
      setModuleValues(emptyModuleValues);
      setRequirementValues(emptyRequirementValues);
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "新建对象失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workbench-menu">
      <button
        className="workbench-action-button"
        onClick={() => setActiveKind("module")}
        type="button"
      >
        <span>+ 新增模块</span>
      </button>
      <button
        className="workbench-action-button"
        onClick={() => setActiveKind("requirement")}
        type="button"
      >
        <span>+ 新增需求</span>
      </button>
      {activeKind ? (
        <div
          aria-label={`新增${kindLabel(activeKind)}`}
          className="workbench-menu-popover"
          role="dialog"
          style={popoverStyle}
        >
          <strong>新增{kindLabel(activeKind)}</strong>
          {activeKind === "module" ? (
            <ModuleFields values={moduleValues} onChange={setModuleValues} />
          ) : (
            <RequirementFields
              values={requirementValues}
              onChange={setRequirementValues}
            />
          )}
          {message ? <small>{message}</small> : null}
          <div style={actionStyle}>
            <button
              className="workbench-menu-item"
              onClick={() => setActiveKind(null)}
              type="button"
            >
              <span>取消</span>
            </button>
            <button
              className="workbench-menu-item"
              disabled={submitting}
              onClick={() => void submit(activeKind)}
              type="button"
            >
              <span>{submitting ? "提交中..." : "创建"}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModuleFields({
  onChange,
  values,
}: {
  readonly values: ModuleFormValues;
  readonly onChange: (values: ModuleFormValues) => void;
}): ReactElement {
  return (
    <>
      <FormInput
        label="名称"
        onChange={(name) => onChange({ ...values, name })}
        required
        value={values.name}
      />
      <FormInput
        label="职责"
        onChange={(responsibility) => onChange({ ...values, responsibility })}
        value={values.responsibility}
      />
      <FormInput
        label="功率(W)"
        onChange={(power_w) => onChange({ ...values, power_w })}
        value={values.power_w}
      />
    </>
  );
}

function RequirementFields({
  onChange,
  values,
}: {
  readonly values: RequirementFormValues;
  readonly onChange: (values: RequirementFormValues) => void;
}): ReactElement {
  return (
    <>
      <FormInput
        label="需求编号"
        onChange={(code) => onChange({ ...values, code })}
        required
        value={values.code}
      />
      <FormInput
        label="需求内容"
        onChange={(text) => onChange({ ...values, text })}
        required
        value={values.text}
      />
      <FormInput
        label="优先级"
        onChange={(priority) => onChange({ ...values, priority })}
        required
        value={values.priority}
      />
    </>
  );
}

function FormInput({
  label,
  onChange,
  required = false,
  value,
}: {
  readonly label: string;
  readonly value: string;
  readonly required?: boolean;
  readonly onChange: (value: string) => void;
}): ReactElement {
  return (
    <label style={fieldStyle}>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        onChange={(event) => onChange(event.currentTarget.value)}
        style={inputStyle}
        value={value}
      />
    </label>
  );
}

function validateModuleForm(values: ModuleFormValues): FormValidationResult {
  const name = values.name.trim();
  if (!name) return { ok: false, message: "请填写模块名称" };
  const powerText = values.power_w.trim();
  const power = powerText === "" ? 0 : Number(powerText);
  if (!Number.isFinite(power)) return { ok: false, message: "功率必须是数字" };
  return {
    ok: true,
    message: "",
    fields: {
      name,
      responsibility: values.responsibility.trim(),
      power_w: power,
    },
  };
}

function validateSystemForm(values: SystemFormValues): FormValidationResult {
  const name = values.name.trim();
  if (!name) return { ok: false, message: "请填写分系统名称" };
  return {
    ok: true,
    message: "",
    fields: {
      name,
      responsibility: values.responsibility.trim(),
    },
  };
}

function validateInterfaceForm(
  values: InterfaceFormValues,
): FormValidationResult {
  const name = values.name.trim();
  if (!name) return { ok: false, message: "请填写接口名称" };
  return {
    ok: true,
    message: "",
    fields: {
      name,
      direction: values.direction.trim(),
      protocol: values.protocol.trim(),
      data: values.data.trim(),
    },
  };
}

function validateRequirementForm(
  values: RequirementFormValues,
): FormValidationResult {
  const code = values.code.trim();
  const text = values.text.trim();
  const priority = values.priority.trim();
  if (!code) return { ok: false, message: "请填写需求编号" };
  if (!text) return { ok: false, message: "请填写需求内容" };
  if (!priority) return { ok: false, message: "请填写优先级" };
  return { ok: true, message: "", fields: { code, text, priority } };
}

function kindLabel(kind: CreateObjectKind): string {
  if (kind === "system") return "分系统";
  if (kind === "module") return "模块";
  if (kind === "interface") return "接口";
  return "需求";
}

async function resolveCreatedObjectId(params: {
  readonly viewClient: Pick<CreateObjectViewClient, "objects">;
  readonly workspaceId: string;
  readonly objectType: string;
  readonly knownIds: ReadonlySet<string>;
  readonly attempts: number;
  readonly delay: (ms: number) => Promise<void>;
}): Promise<string | null> {
  for (let attempt = 0; attempt < params.attempts; attempt += 1) {
    const page = await params.viewClient.objects(
      params.workspaceId,
      params.objectType,
      0,
      pageSize,
    );
    const created = page.items.find(
      (item) => !params.knownIds.has(item.objectId),
    );
    if (created) return created.objectId;
    if (attempt + 1 < params.attempts) await params.delay(resolveDelayMs);
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
