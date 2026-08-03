import { useMemo, useState } from "react";

import type { DataObject } from "../model/kernel";
import { UsButton, UsModal, UsSelect, pushToast } from "../primitives";
import { sessionStore, type SessionStore } from "../state/session-store";
import {
  workspaceStore,
  type WorkspaceState,
  type WorkspaceStore,
  useWorkspaceSnapshot,
} from "../state/workspace-store";
import type {
  DataSourceCreateActionProps,
  DataSourceCreateActionRegistry,
} from "./data-source-create-action-registry";
import { isWriteSubmissionLocked } from "./write-submission-lock";

const requirementRelation = "build_plan_satisfies_requirement";
const terminalStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export const pcProcurementBuildPlanCreateActionId =
  "pc_procurement.build-plan-create";

export interface BuildPlanRequirementOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export type BuildPlanRequirementBindResult =
  | {
      readonly state: "bound";
      readonly relationId: string;
      readonly message: string | null;
    }
  | { readonly state: "validation-failed"; readonly message: string }
  | { readonly state: "permission-denied"; readonly message: string }
  | {
      readonly state: "committed-pending";
      readonly pendingStep: string;
      readonly message: string;
    }
  | {
      readonly state: "partial-failure";
      readonly message: string;
      readonly failedStep: string;
    };

export function buildPlanRequirementOptions(
  workspace: Pick<WorkspaceState, "objects">,
): readonly BuildPlanRequirementOption[] {
  return workspace.objects
    .filter(
      (object) =>
        object.objectTypeCode === "procurement_requirement" &&
        !terminalStatuses.has(object.status),
    )
    .map((object) => ({
      id: object.id,
      code: textValue(object, "code"),
      name: textValue(object, "name"),
    }));
}

export async function bindBuildPlanRequirement(input: {
  readonly planId: string;
  readonly requirementId: string | null;
  readonly workspace?: WorkspaceStore;
  readonly session?: Pick<SessionStore, "can" | "getSnapshot">;
}): Promise<BuildPlanRequirementBindResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const snapshot = workspace.getSnapshot();
  const plan = snapshot.objects.find(
    (object) =>
      object.id === input.planId && object.objectTypeCode === "build_plan",
  );
  if (!plan || terminalStatuses.has(plan.status)) {
    return { state: "validation-failed", message: "当前采购方案不可用" };
  }
  if (!input.requirementId) {
    return { state: "validation-failed", message: "请选择一个采购需求" };
  }
  const requirement = snapshot.objects.find(
    (object) =>
      object.id === input.requirementId &&
      object.objectTypeCode === "procurement_requirement" &&
      !terminalStatuses.has(object.status),
  );
  if (!requirement) {
    return { state: "validation-failed", message: "所选采购需求不可用" };
  }
  if (
    snapshot.relations.some(
      (relation) =>
        relation.relationTypeCode === requirementRelation &&
        relation.status === "active" &&
        relation.sourceId === plan.id,
    )
  ) {
    return { state: "validation-failed", message: "当前方案已经绑定采购需求" };
  }
  const actor = session.getSnapshot().currentMemberId;
  if (!session.can(actor, "build_plan", "editData")) {
    return {
      state: "permission-denied",
      message: "当前成员没有绑定采购需求权限",
    };
  }

  workspace.createRelation({
    relationTypeCode: requirementRelation,
    sourceId: plan.id,
    targetId: requirement.id,
    actor,
    summary: "绑定采购需求",
  });
  const write = await workspace.waitForLastWrite();
  if (write.state === "failed") {
    return {
      state: "partial-failure",
      failedStep: "绑定采购需求关系",
      message: `绑定采购需求关系失败：${write.message}。方案对象已保留，请重新加载工作空间后重试。`,
    };
  }
  if (write.state === "committed-pending") {
    return {
      state: "committed-pending",
      pendingStep: "绑定采购需求关系",
      message: write.message,
    };
  }
  const relationId =
    write.state === "synced" && write.relationId
      ? write.relationId
      : (workspace
          .getRelations()
          .find(
            (relation) =>
              relation.relationTypeCode === requirementRelation &&
              relation.sourceId === plan.id &&
              relation.targetId === requirement.id,
          )?.id ?? "");
  const refresh = await workspace.refreshObjects([plan.id, requirement.id]);
  return {
    state: "bound",
    relationId,
    message:
      refresh.state === "failed"
        ? "关系已创建，但派生字段同步失败，请重新加载工作空间"
        : null,
  };
}

export function registerPcProcurementSourceActions(
  registry: DataSourceCreateActionRegistry,
): void {
  registry.register(
    pcProcurementBuildPlanCreateActionId,
    "pc_procurement",
    "build_plan",
    PcProcurementBuildPlanCreateAction,
  );
}

export function PcProcurementBuildPlanCreateAction({
  object,
  objectType,
  onClose,
  onCompleted,
}: DataSourceCreateActionProps) {
  const workspace = useWorkspaceSnapshot();
  const options = useMemo(
    () => buildPlanRequirementOptions(workspace),
    [workspace],
  );
  const [requirementId, setRequirementId] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [committedPending, setCommittedPending] = useState(false);

  const save = async () => {
    if (isWriteSubmissionLocked(saving, committedPending)) return;
    setSaving(true);
    setMessage(null);
    const result = await bindBuildPlanRequirement({
      planId: object.id,
      requirementId: requirementId || null,
    });
    setSaving(false);
    if (result.state === "bound") {
      if (result.message) {
        pushToast({ title: "采购需求已绑定", desc: result.message });
      }
      onCompleted(object.id);
      onClose();
      return;
    }
    setMessage(result.message);
    if (result.state === "committed-pending") setCommittedPending(true);
  };

  return (
    <UsModal
      footer={
        <>
          <UsButton disabled={saving} onClick={onClose} size="sm">
            稍后绑定
          </UsButton>
          <UsButton
            disabled={
              isWriteSubmissionLocked(saving, committedPending) ||
              options.length === 0
            }
            onClick={() => void save()}
            variant="primary"
          >
            {committedPending
              ? "已提交，待同步"
              : saving
                ? "正在绑定…"
                : "绑定采购需求"}
          </UsButton>
        </>
      }
      onClose={onClose}
      open
      title={`绑定采购需求 · ${objectType.name}`}
    >
      <p className="us-create-record-form__message">
        方案“{textValue(object, "name")}
        ”已创建。请选择当前工作空间中的真实采购需求。
      </p>
      <label className="us-create-record-form__field">
        <span>采购需求 *</span>
        <UsSelect
          aria-label="采购需求"
          disabled={saving || options.length === 0}
          onChange={(event) => setRequirementId(event.currentTarget.value)}
          value={requirementId}
        >
          <option value="">
            {options.length === 0 ? "当前没有可绑定的采购需求" : "请选择"}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.code} · {option.name}
            </option>
          ))}
        </UsSelect>
      </label>
      {message ? (
        <p className="us-create-record-form__message" role="alert">
          {message}
        </p>
      ) : null}
    </UsModal>
  );
}

function textValue(object: DataObject, fieldCode: string): string {
  const value = object.fields[fieldCode]?.value;
  return value === null || value === undefined ? "—" : String(value);
}
