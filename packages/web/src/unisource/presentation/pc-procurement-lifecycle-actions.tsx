import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { UsButton, UsInput, UsModal, pushToast } from "../primitives";
import { usPaths } from "../routes-paths";
import { selectionStore } from "../state/selection-store";
import {
  sessionStore,
  type SessionStore,
  useSessionSnapshot,
} from "../state/session-store";
import {
  workspaceStore,
  type WorkspaceStore,
  useWorkspaceSnapshot,
} from "../state/workspace-store";
import type {
  DataSourceLifecycleActionProps,
  DataSourceLifecycleActionRegistry,
} from "./data-source-lifecycle-action-registry";
import { pcProcurementBuildPlanCopyConfig } from "./pc-procurement-preset";

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
  if (
    snapshot.objects.some(
      (object) =>
        object.objectTypeCode === "build_plan" &&
        object.fields.code?.value === code,
    )
  ) {
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
  return workspace.copyObjectSubtree(
    plan.id,
    {
      ...pcProcurementBuildPlanCopyConfig,
      rootFields: { code, name },
    },
    actor,
  );
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
  const [archiveOpen, setArchiveOpen] = useState(false);
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
        onClick={() => setArchiveOpen(true)}
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
      {archiveOpen ? (
        <ArchiveConfirmation
          objectTypeCode="build_plan"
          props={props}
          onClose={() => setArchiveOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function PcProcurementRequirementLifecycleAction(
  props: DataSourceLifecycleActionProps,
) {
  const [archiveOpen, setArchiveOpen] = useState(false);
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
        onClick={() => setArchiveOpen(true)}
        size="sm"
      >
        归档需求
      </UsButton>
      {archiveOpen ? (
        <ArchiveConfirmation
          objectTypeCode="procurement_requirement"
          props={props}
          onClose={() => setArchiveOpen(false)}
        />
      ) : null}
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

function ArchiveConfirmation({
  objectTypeCode,
  props,
  onClose,
}: {
  readonly objectTypeCode: "build_plan" | "procurement_requirement";
  readonly props: DataSourceLifecycleActionProps;
  readonly onClose: () => void;
}) {
  const workspace = useWorkspaceSnapshot();
  const relationCount = workspace.relations.filter(
    (relation) =>
      relation.status === "active" &&
      (relation.sourceId === props.object.id ||
        relation.targetId === props.object.id),
  ).length;
  const confirm = async () => {
    await archiveFromAction(props, objectTypeCode);
    onClose();
  };
  return (
    <UsModal
      footer={
        <>
          <UsButton onClick={onClose} size="sm">
            取消
          </UsButton>
          <UsButton onClick={() => void confirm()} size="sm" variant="primary">
            确认归档
          </UsButton>
        </>
      }
      onClose={onClose}
      open
      title="确认归档"
    >
      <p>归档后该记录及其 {relationCount} 条关联不会在默认表达中显示。</p>
    </UsModal>
  );
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
