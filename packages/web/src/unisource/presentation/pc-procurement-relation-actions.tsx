import { useMemo, useState } from "react";

import type { DataObject, MemberId } from "../model/kernel";
import { UsButton, UsModal, UsSelect, pushToast } from "../primitives";
import { selectionStore } from "../state/selection-store";
import {
  sessionStore,
  type SessionStore,
  useSessionSnapshot,
} from "../state/session-store";
import {
  type WorkspaceState,
  type WorkspaceStore,
  workspaceStore,
  useWorkspaceSnapshot,
} from "../state/workspace-store";
import type {
  DataSourceRelationActionProps,
  DataSourceRelationActionRegistry,
} from "./data-source-relation-action-registry";
import { ProcurementItemEditor } from "./pc-procurement-item-editor";
import { buildPlanRequirementOptions } from "./pc-procurement-source-actions";

const quoteForProduct = "supplier_quote_for_product";
const quoteOfferedBy = "supplier_quote_offered_by_supplier";
const containsItem = "build_plan_contains_item";
const terminalStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export const pcProcurementRelationActionId =
  "pc_procurement.maintain-relations";

export interface ProcurementQuoteRelationDraft {
  readonly productId: string | null;
  readonly supplierId: string | null;
}

export type ProcurementRelationResult =
  | { readonly state: "updated"; readonly message: string | null }
  | { readonly state: "validation-failed"; readonly message: string }
  | { readonly state: "permission-denied"; readonly message: string }
  | {
      readonly state: "partial-failure";
      readonly failedStep: string;
      readonly completedSteps: readonly string[];
      readonly message: string;
    };

export function initialProcurementQuoteRelationDraft(
  workspace: Pick<WorkspaceState, "relations">,
  quoteId: string,
): ProcurementQuoteRelationDraft {
  return {
    productId: activeTarget(workspace, quoteId, quoteForProduct),
    supplierId: activeTarget(workspace, quoteId, quoteOfferedBy),
  };
}

export function procurementQuoteRelationOptions(
  workspace: Pick<WorkspaceState, "objects">,
): {
  readonly products: readonly DataObject[];
  readonly suppliers: readonly DataObject[];
} {
  const live = (object: DataObject) => !terminalStatuses.has(object.status);
  return {
    products: workspace.objects.filter(
      (object) => object.objectTypeCode === "hardware_product" && live(object),
    ),
    suppliers: workspace.objects.filter(
      (object) => object.objectTypeCode === "supplier" && live(object),
    ),
  };
}

function activeTarget(
  workspace: Pick<WorkspaceState, "relations">,
  sourceId: string,
  relationTypeCode: string,
): string | null {
  return (
    workspace.relations.find(
      (relation) =>
        relation.relationTypeCode === relationTypeCode &&
        relation.sourceId === sourceId &&
        relation.status === "active",
    )?.targetId ?? null
  );
}

export async function updateSupplierQuoteRelations(input: {
  readonly quoteId: string;
  readonly draft: ProcurementQuoteRelationDraft;
  readonly workspace?: WorkspaceStore;
  readonly session?: Pick<SessionStore, "can" | "getSnapshot">;
}): Promise<ProcurementRelationResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const snapshot = workspace.getSnapshot();
  const quote = validObject(snapshot, input.quoteId, "supplier_quote");
  const product = input.draft.productId
    ? validObject(snapshot, input.draft.productId, "hardware_product")
    : null;
  const supplier = input.draft.supplierId
    ? validObject(snapshot, input.draft.supplierId, "supplier")
    : null;
  if (!quote || !product || !supplier) {
    return {
      state: "validation-failed",
      message: "请选择有效的硬件配件和供应商。",
    };
  }
  const actor = session.getSnapshot().currentMemberId;
  if (!session.can(actor, "supplier_quote", "editData")) {
    return {
      state: "permission-denied",
      message: "当前成员没有维护供应商报价关系权限。",
    };
  }
  const completedSteps: string[] = [];
  const productResult = await replaceRelation({
    workspace,
    actor,
    sourceId: quote.id,
    targetId: product.id,
    relationTypeCode: quoteForProduct,
    label: "关联报价与硬件配件",
    completedSteps,
  });
  if (productResult) return productResult;
  const supplierResult = await replaceRelation({
    workspace,
    actor,
    sourceId: quote.id,
    targetId: supplier.id,
    relationTypeCode: quoteOfferedBy,
    label: "关联报价与供应商",
    completedSteps,
  });
  if (supplierResult) return supplierResult;
  const refresh = await workspace.refreshObjects([
    quote.id,
    product.id,
    supplier.id,
  ]);
  return {
    state: "updated",
    message:
      refresh.state === "failed"
        ? "关系已保存，但派生字段同步失败，请重新加载工作空间。"
        : null,
  };
}

export async function updateBuildPlanRequirement(input: {
  readonly planId: string;
  readonly requirementId: string | null;
  readonly workspace?: WorkspaceStore;
  readonly session?: Pick<SessionStore, "can" | "getSnapshot">;
}): Promise<ProcurementRelationResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const snapshot = workspace.getSnapshot();
  const plan = validObject(snapshot, input.planId, "build_plan");
  const requirement = input.requirementId
    ? validObject(snapshot, input.requirementId, "procurement_requirement")
    : null;
  if (!plan || !requirement)
    return { state: "validation-failed", message: "请选择有效的采购需求。" };
  const actor = session.getSnapshot().currentMemberId;
  if (!session.can(actor, "build_plan", "editData")) {
    return {
      state: "permission-denied",
      message: "当前成员没有维护采购方案关系权限。",
    };
  }
  const completedSteps: string[] = [];
  const failure = await replaceRelation({
    workspace,
    actor,
    sourceId: plan.id,
    targetId: requirement.id,
    relationTypeCode: "build_plan_satisfies_requirement",
    label: "关联方案与采购需求",
    completedSteps,
  });
  if (failure) return failure;
  const refresh = await workspace.refreshObjects([plan.id, requirement.id]);
  return {
    state: "updated",
    message:
      refresh.state === "failed"
        ? "关系已保存，但派生字段同步失败，请重新加载工作空间。"
        : null,
  };
}

function validObject(
  workspace: Pick<WorkspaceState, "objects">,
  objectId: string,
  objectTypeCode: string,
): DataObject | null {
  return (
    workspace.objects.find(
      (object) =>
        object.id === objectId &&
        object.objectTypeCode === objectTypeCode &&
        !terminalStatuses.has(object.status),
    ) ?? null
  );
}

async function replaceRelation(input: {
  readonly workspace: WorkspaceStore;
  readonly actor: MemberId;
  readonly sourceId: string;
  readonly targetId: string;
  readonly relationTypeCode: string;
  readonly label: string;
  readonly completedSteps: string[];
}): Promise<Extract<
  ProcurementRelationResult,
  { state: "partial-failure" }
> | null> {
  const current = input.workspace
    .getRelations(input.sourceId)
    .find(
      (relation) =>
        relation.relationTypeCode === input.relationTypeCode &&
        relation.status === "active",
    );
  if (current?.targetId === input.targetId) return null;
  if (current) {
    input.workspace.unlinkRelation(current.id, input.actor);
    const write = await input.workspace.waitForLastWrite();
    if (write.state === "failed")
      return partialFailure(
        `解除旧${input.label}`,
        write.message,
        input.completedSteps,
      );
    input.completedSteps.push(`解除旧${input.label}`);
  }
  input.workspace.createRelation({
    relationTypeCode: input.relationTypeCode,
    sourceId: input.sourceId,
    targetId: input.targetId,
    actor: input.actor,
    summary: input.label,
  });
  const write = await input.workspace.waitForLastWrite();
  if (write.state === "failed")
    return partialFailure(input.label, write.message, input.completedSteps);
  input.completedSteps.push(input.label);
  return null;
}

function partialFailure(
  failedStep: string,
  message: string,
  completedSteps: readonly string[],
): Extract<ProcurementRelationResult, { state: "partial-failure" }> {
  return {
    state: "partial-failure",
    failedStep,
    completedSteps,
    message: `${failedStep}失败：${message}。已完成步骤：${completedSteps.join("、") || "无"}。请重新加载工作空间后重试。`,
  };
}

export function registerPcProcurementRelationActions(
  registry: DataSourceRelationActionRegistry,
): void {
  for (const objectTypeCode of [
    "build_plan",
    "build_plan_item",
    "supplier_quote",
  ]) {
    registry.register(
      `${pcProcurementRelationActionId}.${objectTypeCode}`,
      "pc_procurement",
      objectTypeCode,
      PcProcurementRelationAction,
    );
  }
}

export function PcProcurementRelationAction(
  props: DataSourceRelationActionProps,
) {
  const [open, setOpen] = useState(false);
  const canEdit =
    sessionStore.can(
      useSessionSnapshot().currentMemberId,
      props.objectType.code,
      "editData",
    ) && !terminalStatuses.has(props.object.status);
  return (
    <div className="us-data-source-relation-action">
      <UsButton
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        size="sm"
        title={canEdit ? "维护所选记录的真实关系" : "当前成员没有关系维护权限"}
        variant="secondary"
      >
        维护关系
      </UsButton>
      {open ? (
        <RelationActionDialog
          object={props.object}
          onClose={() => setOpen(false)}
          onCompleted={props.onCompleted}
        />
      ) : null}
    </div>
  );
}

function RelationActionDialog({
  object,
  onClose,
  onCompleted,
}: Pick<DataSourceRelationActionProps, "object" | "onCompleted"> & {
  readonly onClose: () => void;
}) {
  if (object.objectTypeCode === "supplier_quote") {
    return (
      <SupplierQuoteRelationDialog
        object={object}
        onClose={onClose}
        onCompleted={onCompleted}
      />
    );
  }
  return (
    <PlanRelationDialog
      object={object}
      onClose={onClose}
      onCompleted={onCompleted}
    />
  );
}

function PlanRelationDialog({
  object,
  onClose,
  onCompleted,
}: Pick<DataSourceRelationActionProps, "object" | "onCompleted"> & {
  readonly onClose: () => void;
}) {
  const workspace = useWorkspaceSnapshot();
  const planId =
    object.objectTypeCode === "build_plan"
      ? object.id
      : workspace.relations.find(
          (relation) =>
            relation.relationTypeCode === containsItem &&
            relation.targetId === object.id &&
            relation.status === "active",
        )?.sourceId;
  if (!planId) {
    return (
      <UsModal onClose={onClose} open title="维护关系">
        <p>当前方案明细未关联有效采购方案，无法维护方案关系。</p>
      </UsModal>
    );
  }
  return (
    <UsModal onClose={onClose} open title="维护采购方案关系">
      <PlanRequirementBinding planId={planId} onCompleted={onCompleted} />
      <ProcurementItemEditor planId={planId} />
    </UsModal>
  );
}

function PlanRequirementBinding({
  planId,
  onCompleted,
}: {
  readonly planId: string;
  readonly onCompleted: (objectId: string) => void;
}) {
  const workspace = useWorkspaceSnapshot();
  const options = useMemo(
    () => buildPlanRequirementOptions(workspace),
    [workspace],
  );
  const [requirementId, setRequirementId] = useState(
    () =>
      activeTarget(workspace, planId, "build_plan_satisfies_requirement") ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const result = await updateBuildPlanRequirement({
      planId,
      requirementId: requirementId || null,
    });
    setSaving(false);
    if (result.state === "updated") {
      pushToast({ title: "采购需求已绑定", desc: result.message ?? undefined });
      onCompleted(planId);
      return;
    }
    setMessage(result.message);
  };
  return (
    <section className="us-procurement-relation-section">
      <h3>采购需求</h3>
      <UsSelect
        aria-label="采购需求"
        disabled={saving || options.length === 0}
        onChange={(event) => {
          setRequirementId(event.currentTarget.value);
          if (event.currentTarget.value)
            selectionStore.set({
              entityType: "object",
              entityId: event.currentTarget.value,
            });
        }}
        value={requirementId}
      >
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.code} · {option.name}
          </option>
        ))}
      </UsSelect>
      <UsButton
        disabled={saving || !requirementId}
        onClick={() => void save()}
        size="sm"
      >
        {saving ? "正在绑定…" : "绑定采购需求"}
      </UsButton>
      {message ? <p role="alert">{message}</p> : null}
    </section>
  );
}

function SupplierQuoteRelationDialog({
  object,
  onClose,
  onCompleted,
}: Pick<DataSourceRelationActionProps, "object" | "onCompleted"> & {
  readonly onClose: () => void;
}) {
  const workspace = useWorkspaceSnapshot();
  const options = useMemo(
    () => procurementQuoteRelationOptions(workspace),
    [workspace],
  );
  const [draft, setDraft] = useState(() =>
    initialProcurementQuoteRelationDraft(workspace, object.id),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    const result = await updateSupplierQuoteRelations({
      quoteId: object.id,
      draft,
    });
    setSaving(false);
    if (result.state === "updated") {
      pushToast({
        title: "供应商报价关系已保存",
        desc: result.message ?? undefined,
      });
      onCompleted(object.id);
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
            {saving ? "正在保存…" : "保存关系"}
          </UsButton>
        </>
      }
      onClose={onClose}
      open
      title="维护供应商报价关系"
    >
      <label className="us-create-record-form__field">
        <span>硬件配件 *</span>
        <UsSelect
          aria-label="硬件配件"
          disabled={saving}
          onChange={(event) => {
            const productId = event.currentTarget.value || null;
            setDraft((current) => ({ ...current, productId }));
            if (productId)
              selectionStore.set({ entityType: "object", entityId: productId });
          }}
          value={draft.productId ?? ""}
        >
          <option value="">请选择</option>
          {options.products.map((product) => (
            <option key={product.id} value={product.id}>
              {objectText(product, "code")} · {objectText(product, "name")}
            </option>
          ))}
        </UsSelect>
      </label>
      <label className="us-create-record-form__field">
        <span>供应商 *</span>
        <UsSelect
          aria-label="供应商"
          disabled={saving}
          onChange={(event) => {
            const supplierId = event.currentTarget.value || null;
            setDraft((current) => ({ ...current, supplierId }));
            if (supplierId)
              selectionStore.set({
                entityType: "object",
                entityId: supplierId,
              });
          }}
          value={draft.supplierId ?? ""}
        >
          <option value="">请选择</option>
          {options.suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {objectText(supplier, "code")} · {objectText(supplier, "name")}
            </option>
          ))}
        </UsSelect>
      </label>
      {message ? <p role="alert">{message}</p> : null}
    </UsModal>
  );
}

function objectText(object: DataObject, fieldCode: string): string {
  const value = object.fields[fieldCode]?.value;
  return value === null || value === undefined ? "—" : String(value);
}
