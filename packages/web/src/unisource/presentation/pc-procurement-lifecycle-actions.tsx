import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DataFieldPrimitive, DataObject, MemberId } from "../model/kernel";
import { UsButton, UsInput, UsModal, pushToast } from "../primitives";
import { usPaths } from "../routes-paths";
import { selectionStore } from "../state/selection-store";
import {
  sessionStore,
  type SessionStore,
  useSessionSnapshot,
} from "../state/session-store";
import { workspaceStore, type WorkspaceStore } from "../state/workspace-store";
import type {
  DataSourceLifecycleActionProps,
  DataSourceLifecycleActionRegistry,
} from "./data-source-lifecycle-action-registry";

const containsItem = "build_plan_contains_item";
const satisfiesRequirement = "build_plan_satisfies_requirement";
const selectsProduct = "build_plan_item_selects_product";
const usesQuote = "build_plan_item_uses_supplier_quote";
const terminalStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export const pcProcurementLifecycleActionId = "pc_procurement.lifecycle";

export type ProcurementLifecycleResult =
  | {
      readonly state: "completed";
      readonly objectId: string;
      readonly message: string | null;
    }
  | { readonly state: "validation-failed"; readonly message: string }
  | { readonly state: "permission-denied"; readonly message: string }
  | {
      readonly state: "partial-failure";
      readonly failedStep: string;
      readonly completedSteps: readonly string[];
      readonly message: string;
    };

export async function archiveProcurementObject(input: {
  readonly objectId: string;
  readonly objectTypeCode: "build_plan" | "procurement_requirement";
  readonly workspace?: WorkspaceStore;
  readonly session?: Pick<SessionStore, "can" | "getSnapshot">;
}): Promise<ProcurementLifecycleResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const object = workspace.getObject(input.objectId);
  if (
    !object ||
    object.objectTypeCode !== input.objectTypeCode ||
    terminalStatuses.has(object.status)
  ) {
    return { state: "validation-failed", message: "当前记录不可归档。" };
  }
  const actor = session.getSnapshot().currentMemberId;
  if (!session.can(actor, object.objectTypeCode, "editData")) {
    return {
      state: "permission-denied",
      message: "当前成员没有归档记录权限。",
    };
  }
  workspace.deleteObject(object.id, actor);
  const write = await workspace.waitForLastWrite();
  if (write.state === "failed") {
    return {
      state: "partial-failure",
      failedStep: "归档记录",
      completedSteps: [],
      message: `归档记录失败：${write.message}。请重新加载工作空间后重试。`,
    };
  }
  return { state: "completed", objectId: object.id, message: null };
}

export async function copyBuildPlan(input: {
  readonly planId: string;
  readonly code: string;
  readonly name: string;
  readonly workspace?: WorkspaceStore;
  readonly session?: Pick<SessionStore, "can" | "getSnapshot">;
}): Promise<ProcurementLifecycleResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const snapshot = workspace.getSnapshot();
  const plan = snapshot.objects.find(
    (object) =>
      object.id === input.planId &&
      object.objectTypeCode === "build_plan" &&
      !terminalStatuses.has(object.status),
  );
  const code = input.code.trim();
  const name = input.name.trim();
  if (!plan || !code || !name)
    return { state: "validation-failed", message: "请填写新方案编码和名称。" };
  if (snapshot.objects.some((object) => object.fields.code?.value === code)) {
    return {
      state: "validation-failed",
      message: "方案编码已存在，请使用其他编码。",
    };
  }
  const actor = session.getSnapshot().currentMemberId;
  if (
    !session.can(actor, "build_plan", "editData") ||
    !session.can(actor, "build_plan_item", "editData")
  ) {
    return {
      state: "permission-denied",
      message: "当前成员没有复制采购方案权限。",
    };
  }
  return copyPlanGraph(workspace, plan, { code, name }, actor);
}

async function copyPlanGraph(
  workspace: WorkspaceStore,
  plan: DataObject,
  identity: { readonly code: string; readonly name: string },
  actor: MemberId,
): Promise<ProcurementLifecycleResult> {
  const completedSteps: string[] = [];
  const copiedPlan = workspace.createObject({
    objectTypeCode: "build_plan",
    fields: { ...storedFields(workspace, plan), ...identity },
    actor,
    summary: "复制采购方案",
  });
  const write = await workspace.waitForLastWrite();
  if (write.state === "failed")
    return copyFailure("创建采购方案", write.message, completedSteps);
  completedSteps.push("创建采购方案");
  const planId =
    write.state === "synced" && write.objectId ? write.objectId : copiedPlan.id;
  const requirements = activeTargets(workspace, plan.id, satisfiesRequirement);
  for (const requirementId of requirements) {
    const failure = await createCopyRelation(
      workspace,
      satisfiesRequirement,
      planId,
      requirementId,
      actor,
      "复制采购需求关系",
      completedSteps,
    );
    if (failure) return failure;
  }
  const itemIds = activeTargets(workspace, plan.id, containsItem);
  for (let index = 0; index < itemIds.length; index += 1) {
    const failure = await copyPlanItem(
      workspace,
      planId,
      itemIds[index]!,
      index + 1,
      actor,
      completedSteps,
    );
    if (failure) return failure;
  }
  const refresh = await workspace.refreshObjects([planId]);
  return {
    state: "completed",
    objectId: planId,
    message:
      refresh.state === "failed"
        ? "方案已复制，但派生字段同步失败，请重新加载工作空间。"
        : null,
  };
}

async function copyPlanItem(
  workspace: WorkspaceStore,
  planId: string,
  itemId: string,
  ordinal: number,
  actor: MemberId,
  completedSteps: string[],
): Promise<Extract<
  ProcurementLifecycleResult,
  { state: "partial-failure" }
> | null> {
  const item = workspace.getObject(itemId);
  if (
    !item ||
    item.objectTypeCode !== "build_plan_item" ||
    terminalStatuses.has(item.status)
  ) {
    return copyFailure("读取方案明细", "原方案明细不可用", completedSteps);
  }
  const baseCode = String(item.fields.code?.value ?? "ITEM");
  const baseName = String(item.fields.name?.value ?? "方案明细");
  const copiedItem = workspace.createObject({
    objectTypeCode: "build_plan_item",
    fields: {
      ...storedFields(workspace, item),
      code: uniqueItemCode(workspace, `${baseCode}-COPY-${ordinal}`),
      name: `${baseName}（复制）`,
    },
    actor,
    summary: "复制采购方案明细",
  });
  const write = await workspace.waitForLastWrite();
  if (write.state === "failed")
    return copyFailure("创建方案明细", write.message, completedSteps);
  completedSteps.push("创建方案明细");
  const copiedItemId =
    write.state === "synced" && write.objectId ? write.objectId : copiedItem.id;
  for (const [relationTypeCode, label] of [
    [containsItem, "关联方案与明细"],
    [selectsProduct, "复用硬件配件"],
    [usesQuote, "复用供应商报价"],
  ] as const) {
    const sourceId = relationTypeCode === containsItem ? planId : copiedItemId;
    const targets =
      relationTypeCode === containsItem
        ? [copiedItemId]
        : activeTargets(workspace, item.id, relationTypeCode);
    for (const targetId of targets) {
      const failure = await createCopyRelation(
        workspace,
        relationTypeCode,
        sourceId,
        targetId,
        actor,
        label,
        completedSteps,
      );
      if (failure) return failure;
    }
  }
  return null;
}

async function createCopyRelation(
  workspace: WorkspaceStore,
  relationTypeCode: string,
  sourceId: string,
  targetId: string,
  actor: MemberId,
  label: string,
  completedSteps: string[],
): Promise<Extract<
  ProcurementLifecycleResult,
  { state: "partial-failure" }
> | null> {
  workspace.createRelation({
    relationTypeCode,
    sourceId,
    targetId,
    actor,
    summary: label,
  });
  const write = await workspace.waitForLastWrite();
  if (write.state === "failed")
    return copyFailure(label, write.message, completedSteps);
  completedSteps.push(label);
  return null;
}

function activeTargets(
  workspace: WorkspaceStore,
  sourceId: string,
  relationTypeCode: string,
): readonly string[] {
  return workspace
    .getRelations(sourceId)
    .filter(
      (relation) =>
        relation.relationTypeCode === relationTypeCode &&
        relation.status === "active",
    )
    .map((relation) => relation.targetId);
}

function storedFields(
  workspace: WorkspaceStore,
  object: DataObject,
): Record<string, DataFieldPrimitive> {
  const objectType = workspace
    .getSnapshot()
    .objectTypes.find((type) => type.code === object.objectTypeCode);
  return Object.fromEntries(
    (objectType?.fields ?? [])
      .filter((field) => !field.computed && !field.readOnly)
      .flatMap((field) =>
        object.fields[field.code]
          ? [[field.code, object.fields[field.code]!.value]]
          : [],
      ),
  );
}

function uniqueItemCode(workspace: WorkspaceStore, base: string): string {
  const codes = new Set(
    workspace
      .getSnapshot()
      .objects.map((object) => String(object.fields.code?.value ?? "")),
  );
  if (!codes.has(base)) return base;
  let suffix = 2;
  while (codes.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function copyFailure(
  failedStep: string,
  message: string,
  completedSteps: readonly string[],
): Extract<ProcurementLifecycleResult, { state: "partial-failure" }> {
  return {
    state: "partial-failure",
    failedStep,
    completedSteps,
    message: `${failedStep}失败：${message}。已完成步骤：${completedSteps.join("、") || "无"}。请重新加载工作空间后重试。`,
  };
}

export function registerPcProcurementLifecycleActions(
  registry: DataSourceLifecycleActionRegistry,
): void {
  registry.register(
    `${pcProcurementLifecycleActionId}.build-plan`,
    "pc_procurement",
    "build_plan",
    PcProcurementBuildPlanLifecycleAction,
  );
  registry.register(
    `${pcProcurementLifecycleActionId}.requirement`,
    "pc_procurement",
    "procurement_requirement",
    PcProcurementRequirementLifecycleAction,
  );
}

export function PcProcurementBuildPlanLifecycleAction(
  props: DataSourceLifecycleActionProps,
) {
  const navigate = useNavigate();
  const [copyOpen, setCopyOpen] = useState(false);
  const canEdit =
    sessionStore.can(
      useSessionSnapshot().currentMemberId,
      "build_plan",
      "editData",
    ) && !terminalStatuses.has(props.object.status);
  const open = (exprId: string, form: "grid" | "doc" | "canvas" | "matrix") => {
    selectionStore.set({ entityType: "object", entityId: props.object.id });
    navigate(usPaths.expr(exprId, form));
  };
  return (
    <div className="us-data-source-lifecycle-action">
      <UsButton
        onClick={() => open("exp-pc-document", "doc")}
        size="sm"
        variant="secondary"
      >
        打开方案
      </UsButton>
      <UsButton
        disabled={!canEdit}
        onClick={() => setCopyOpen(true)}
        size="sm"
        variant="secondary"
      >
        复制方案
      </UsButton>
      <UsButton
        disabled={!canEdit}
        onClick={() => void archiveFromAction(props, "build_plan")}
        size="sm"
      >
        归档方案
      </UsButton>
      <UsButton onClick={() => open("exp-pc-plan-map", "canvas")} size="sm">
        关系图
      </UsButton>
      <UsButton onClick={() => open("exp-pc-compare", "matrix")} size="sm">
        方案对比
      </UsButton>
      {copyOpen ? (
        <CopyBuildPlanDialog
          object={props.object}
          onClose={() => setCopyOpen(false)}
          onCompleted={props.onCompleted}
        />
      ) : null}
    </div>
  );
}

export function PcProcurementRequirementLifecycleAction(
  props: DataSourceLifecycleActionProps,
) {
  const canEdit =
    sessionStore.can(
      useSessionSnapshot().currentMemberId,
      "procurement_requirement",
      "editData",
    ) && !terminalStatuses.has(props.object.status);
  return (
    <div className="us-data-source-lifecycle-action">
      <UsButton
        disabled={!canEdit}
        onClick={() => void archiveFromAction(props, "procurement_requirement")}
        size="sm"
      >
        归档需求
      </UsButton>
    </div>
  );
}

async function archiveFromAction(
  props: DataSourceLifecycleActionProps,
  objectTypeCode: "build_plan" | "procurement_requirement",
): Promise<void> {
  const result = await archiveProcurementObject({
    objectId: props.object.id,
    objectTypeCode,
  });
  if (result.state === "completed") {
    pushToast({
      title: objectTypeCode === "build_plan" ? "方案已归档" : "采购需求已归档",
    });
    props.onCompleted(result.objectId);
    return;
  }
  pushToast({ title: "归档失败", desc: result.message });
}

function CopyBuildPlanDialog({
  object,
  onClose,
  onCompleted,
}: Pick<DataSourceLifecycleActionProps, "object" | "onCompleted"> & {
  readonly onClose: () => void;
}) {
  const [code, setCode] = useState(
    `${String(object.fields.code?.value ?? "PLAN")}-COPY`,
  );
  const [name, setName] = useState(
    `${String(object.fields.name?.value ?? "采购方案")}（复制）`,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    const result = await copyBuildPlan({ planId: object.id, code, name });
    setSaving(false);
    if (result.state === "completed") {
      selectionStore.set({ entityType: "object", entityId: result.objectId });
      pushToast({ title: "方案已复制", desc: result.message ?? undefined });
      onCompleted(result.objectId);
      onClose();
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
            {saving ? "正在复制…" : "复制方案"}
          </UsButton>
        </>
      }
      onClose={onClose}
      open
      title="复制采购方案"
    >
      <label className="us-create-record-form__field">
        <span>新方案编码 *</span>
        <UsInput
          aria-label="新方案编码"
          disabled={saving}
          onChange={(event) => setCode(event.currentTarget.value)}
          value={code}
        />
      </label>
      <label className="us-create-record-form__field">
        <span>新方案名称 *</span>
        <UsInput
          aria-label="新方案名称"
          disabled={saving}
          onChange={(event) => setName(event.currentTarget.value)}
          value={name}
        />
      </label>
      {message ? <p role="alert">{message}</p> : null}
    </UsModal>
  );
}
