import type { DataFieldPrimitive, DataObject, MemberId } from "../model/kernel";
import { sessionStore, type SessionStore } from "../state/session-store";
import {
  workspaceStore,
  type WorkspaceState,
  type WorkspaceStore,
  type WriteCompletion,
} from "../state/workspace-store";

const containsItem = "build_plan_contains_item";
const selectsProduct = "build_plan_item_selects_product";
const usesQuote = "build_plan_item_uses_supplier_quote";
const quoteForProduct = "supplier_quote_for_product";
const quoteOfferedBy = "supplier_quote_offered_by_supplier";
const terminalObjectStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export interface ProcurementItemDraft {
  readonly code: string;
  readonly name: string;
  readonly productId: string | null;
  readonly quoteId: string | null;
  readonly quantity: string | number;
}

export interface ProcurementProductOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly referencePriceCny: string;
  readonly performanceScore: string;
  readonly powerW: string;
}

export interface ProcurementQuoteOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly unitPriceCny: string;
  readonly inventoryQty: string;
  readonly deliveryDays: string;
  readonly supplierName: string | null;
}

export interface ProcurementItemFormModel {
  readonly planId: string;
  readonly products: readonly ProcurementProductOption[];
  readonly quotes: readonly ProcurementQuoteOption[];
  readonly existingCodes: readonly string[];
}

export type ProcurementItemCreateResult =
  | {
      readonly state: "created";
      readonly itemId: string;
      readonly message: string | null;
    }
  | { readonly state: "validation-failed"; readonly message: string }
  | { readonly state: "permission-denied"; readonly message: string }
  | {
      readonly state: "partial-failure";
      readonly failedStep: string;
      readonly message: string;
      readonly completedSteps: readonly string[];
    };

export interface ProcurementItemEditDraft {
  readonly productId: string | null;
  readonly quoteId: string | null;
  readonly quantity: string | number;
}

export type ProcurementItemEditResult =
  | {
      readonly state: "updated";
      readonly itemId: string;
      readonly message: string | null;
      readonly completedSteps: readonly string[];
    }
  | { readonly state: "validation-failed"; readonly message: string }
  | { readonly state: "permission-denied"; readonly message: string }
  | {
      readonly state: "partial-failure";
      readonly failedStep: string;
      readonly message: string;
      readonly completedSteps: readonly string[];
    };

export type ProcurementItemRemoveResult =
  | {
      readonly state: "removed";
      readonly itemId: string;
      readonly message: string | null;
    }
  | { readonly state: "validation-failed"; readonly message: string }
  | { readonly state: "permission-denied"; readonly message: string }
  | {
      readonly state: "partial-failure";
      readonly failedStep: string;
      readonly message: string;
      readonly completedSteps: readonly string[];
    };

export function createInitialProcurementItemDraft(): ProcurementItemDraft {
  return { code: "", name: "", productId: null, quoteId: null, quantity: 1 };
}

export function buildProcurementItemFormModel(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  planId: string,
  selectedProductId: string | null,
): ProcurementItemFormModel {
  const products = workspace.objects
    .filter(
      (object) =>
        object.objectTypeCode === "hardware_product" &&
        !terminalObjectStatuses.has(object.status),
    )
    .map(productOption);
  const quotes = workspace.objects
    .filter(
      (object) =>
        object.objectTypeCode === "supplier_quote" &&
        !terminalObjectStatuses.has(object.status),
    )
    .filter((quote) =>
      quoteMatchesProduct(workspace, quote.id, selectedProductId),
    )
    .map((quote) => quoteOption(workspace, quote));
  const existingCodes = workspace.objects
    .filter((object) => object.objectTypeCode === "build_plan_item")
    .map((object) => textValue(object, "code"));
  return { planId, products, quotes, existingCodes };
}

export async function createProcurementItem(input: {
  readonly planId: string;
  readonly draft: ProcurementItemDraft;
  readonly workspace?: WorkspaceStore;
  readonly session?: Pick<SessionStore, "can" | "getSnapshot">;
}): Promise<ProcurementItemCreateResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const validation = validateProcurementItem(
    workspace.getSnapshot(),
    input.planId,
    input.draft,
  );
  if (validation.state === "invalid") {
    return { state: "validation-failed", message: validation.message };
  }
  const actor = session.getSnapshot().currentMemberId;
  if (!session.can(actor, "build_plan_item", "editData")) {
    return {
      state: "permission-denied",
      message: "当前成员没有新增采购明细权限",
    };
  }

  const completedSteps: string[] = [];
  const item = workspace.createObject({
    objectTypeCode: "build_plan_item",
    fields: validation.fields,
    actor,
    source: "manual",
    summary: "新增采购方案明细",
  });
  const itemWrite = await workspace.waitForLastWrite();
  if (itemWrite.state === "failed") {
    return partialFailure("创建明细对象", itemWrite, completedSteps);
  }
  completedSteps.push("创建明细对象");
  const itemId = resolvedObjectId(item.id, itemWrite);

  const relations = [
    {
      label: "关联方案与明细",
      relationTypeCode: containsItem,
      sourceId: input.planId,
      targetId: itemId,
    },
    {
      label: "关联明细与配件",
      relationTypeCode: selectsProduct,
      sourceId: itemId,
      targetId: validation.productId,
    },
    {
      label: "关联明细与报价",
      relationTypeCode: usesQuote,
      sourceId: itemId,
      targetId: validation.quoteId,
    },
  ] as const;
  for (const relation of relations) {
    workspace.createRelation({
      ...relation,
      actor,
      summary: relation.label,
    });
    const write = await workspace.waitForLastWrite();
    if (write.state === "failed") {
      return partialFailure(relation.label, write, completedSteps);
    }
    completedSteps.push(relation.label);
  }

  const refresh = await workspace.refreshObjects([input.planId, itemId]);
  return {
    state: "created",
    itemId,
    message:
      refresh.state === "failed"
        ? "明细已创建，派生字段同步失败，请重新加载工作空间"
        : null,
  };
}

export function initialProcurementItemEditDraft(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  itemId: string,
): ProcurementItemEditDraft {
  const item = workspace.objects.find((object) => object.id === itemId);
  const product = activeRelationTarget(workspace, itemId, selectsProduct);
  const quote = activeRelationTarget(workspace, itemId, usesQuote);
  return {
    productId: product,
    quoteId: quote,
    quantity:
      item?.fields.quantity?.value === undefined
        ? ""
        : String(item.fields.quantity.value),
  };
}

export async function updateProcurementItem(input: {
  readonly planId: string;
  readonly itemId: string;
  readonly draft: ProcurementItemEditDraft;
  readonly workspace?: WorkspaceStore;
  readonly session?: Pick<SessionStore, "can" | "getSnapshot">;
}): Promise<ProcurementItemEditResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const snapshot = workspace.getSnapshot();
  const validation = validateProcurementItemEdit(
    snapshot,
    input.planId,
    input.itemId,
    input.draft,
  );
  if (validation.state === "invalid") {
    return { state: "validation-failed", message: validation.message };
  }
  const actor = session.getSnapshot().currentMemberId;
  if (!session.can(actor, "build_plan_item", "editData")) {
    return {
      state: "permission-denied",
      message: "当前成员没有维护采购明细权限",
    };
  }

  const completedSteps: string[] = [];
  const item = snapshot.objects.find((object) => object.id === input.itemId)!;
  const currentQuantity = item.fields.quantity?.value;
  if (currentQuantity !== validation.quantity) {
    workspace.updateField(input.itemId, "quantity", validation.quantity, {
      actor,
      summary: "更新采购明细数量",
    });
    const write = await workspace.waitForLastWrite();
    if (write.state === "failed") {
      return editPartialFailure("更新采购明细数量", write, completedSteps);
    }
    completedSteps.push("更新采购明细数量");
  }

  const relationSteps = await replaceProcurementItemRelations({
    workspace,
    itemId: input.itemId,
    productId: validation.productId,
    quoteId: validation.quoteId,
    actor,
    completedSteps,
  });
  if (relationSteps.state === "partial-failure") return relationSteps;
  const refresh = await workspace.refreshObjects([
    input.planId,
    input.itemId,
    validation.productId,
    validation.quoteId,
  ]);
  return {
    state: "updated",
    itemId: input.itemId,
    completedSteps: relationSteps.completedSteps,
    message:
      refresh.state === "failed"
        ? "明细已更新，但派生字段同步失败，请重新加载工作空间"
        : null,
  };
}

export function validateProcurementItemEdit(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  planId: string,
  itemId: string,
  draft: ProcurementItemEditDraft,
):
  | {
      readonly state: "valid";
      readonly quantity: number;
      readonly productId: string;
      readonly quoteId: string;
    }
  | { readonly state: "invalid"; readonly message: string } {
  const plan = workspace.objects.find(
    (object) => object.id === planId && object.objectTypeCode === "build_plan",
  );
  const item = workspace.objects.find(
    (object) =>
      object.id === itemId && object.objectTypeCode === "build_plan_item",
  );
  if (
    !plan ||
    !item ||
    terminalObjectStatuses.has(plan.status) ||
    terminalObjectStatuses.has(item.status)
  ) {
    return { state: "invalid", message: "当前采购明细不可编辑" };
  }
  const quantity = Number(draft.quantity);
  if (
    !Number.isFinite(quantity) ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return { state: "invalid", message: "数量必须是大于 0 的整数" };
  }
  if (!draft.productId) return { state: "invalid", message: "请选择硬件配件" };
  if (!draft.quoteId) return { state: "invalid", message: "请选择供应商报价" };
  const product = workspace.objects.find(
    (object) =>
      object.id === draft.productId &&
      object.objectTypeCode === "hardware_product" &&
      !terminalObjectStatuses.has(object.status),
  );
  if (!product) return { state: "invalid", message: "硬件配件不可用" };
  const quote = workspace.objects.find(
    (object) =>
      object.id === draft.quoteId &&
      object.objectTypeCode === "supplier_quote" &&
      !terminalObjectStatuses.has(object.status),
  );
  if (!quote) return { state: "invalid", message: "供应商报价不可用" };
  if (!quoteMatchesProduct(workspace, quote.id, product.id)) {
    return { state: "invalid", message: "供应商报价与硬件配件不匹配" };
  }
  return { state: "valid", quantity, productId: product.id, quoteId: quote.id };
}

export async function removeProcurementItemFromPlan(input: {
  readonly planId: string;
  readonly itemId: string;
  readonly workspace?: WorkspaceStore;
  readonly session?: Pick<SessionStore, "can" | "getSnapshot">;
}): Promise<ProcurementItemRemoveResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const snapshot = workspace.getSnapshot();
  const plan = snapshot.objects.find(
    (object) =>
      object.id === input.planId && object.objectTypeCode === "build_plan",
  );
  const item = snapshot.objects.find(
    (object) =>
      object.id === input.itemId && object.objectTypeCode === "build_plan_item",
  );
  if (
    !plan ||
    !item ||
    terminalObjectStatuses.has(plan.status) ||
    terminalObjectStatuses.has(item.status)
  ) {
    return { state: "validation-failed", message: "当前采购明细不可移除" };
  }
  const contains = snapshot.relations.find(
    (relation) =>
      relation.relationTypeCode === containsItem &&
      relation.status === "active" &&
      relation.sourceId === plan.id &&
      relation.targetId === item.id,
  );
  if (!contains)
    return { state: "validation-failed", message: "方案明细关系不存在" };
  const actor = session.getSnapshot().currentMemberId;
  if (!session.can(actor, "build_plan_item", "editData")) {
    return {
      state: "permission-denied",
      message: "当前成员没有移除采购明细权限",
    };
  }
  workspace.unlinkRelation(contains.id, actor);
  const write = await workspace.waitForLastWrite();
  if (write.state === "failed") {
    return {
      state: "partial-failure",
      failedStep: "解除方案明细关系",
      message: `解除方案明细关系失败：${write.message}。请重新加载工作空间后重试。`,
      completedSteps: [],
    };
  }
  const refresh = await workspace.refreshObjects([plan.id, item.id]);
  return {
    state: "removed",
    itemId: item.id,
    message:
      refresh.state === "failed"
        ? "已解除方案关系，但派生字段同步失败，请重新加载工作空间"
        : null,
  };
}

type ProcurementItemValidation =
  | {
      readonly state: "valid";
      readonly fields: Record<string, DataFieldPrimitive>;
      readonly productId: string;
      readonly quoteId: string;
    }
  | { readonly state: "invalid"; readonly message: string };

export function validateProcurementItem(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  planId: string,
  draft: ProcurementItemDraft,
): ProcurementItemValidation {
  const code = draft.code.trim();
  const name = draft.name.trim();
  const plan = workspace.objects.find(
    (object) => object.id === planId && object.objectTypeCode === "build_plan",
  );
  if (!plan || ["archived", "deleted", "soft-deleted"].includes(plan.status)) {
    return { state: "invalid", message: "当前采购方案不可用" };
  }
  if (!code) return { state: "invalid", message: "请填写明细编码" };
  if (!name) return { state: "invalid", message: "请填写明细名称" };
  const quantity = Number(draft.quantity);
  if (
    !Number.isFinite(quantity) ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return { state: "invalid", message: "数量必须是大于 0 的整数" };
  }
  if (workspace.objects.some((object) => textValue(object, "code") === code)) {
    return { state: "invalid", message: "明细编码已存在，请使用其他编码" };
  }
  if (!draft.productId) return { state: "invalid", message: "请选择硬件配件" };
  if (!draft.quoteId) return { state: "invalid", message: "请选择供应商报价" };
  const product = workspace.objects.find(
    (object) =>
      object.id === draft.productId &&
      object.objectTypeCode === "hardware_product" &&
      !terminalObjectStatuses.has(object.status),
  );
  if (!product) return { state: "invalid", message: "所选硬件配件不可用" };
  const quote = workspace.objects.find(
    (object) =>
      object.id === draft.quoteId && object.objectTypeCode === "supplier_quote",
  );
  if (!quote || terminalObjectStatuses.has(quote.status)) {
    return { state: "invalid", message: "所选供应商报价不可用" };
  }
  if (!quoteMatchesProduct(workspace, quote.id, product.id)) {
    return { state: "invalid", message: "供应商报价与所选硬件配件不匹配" };
  }
  return {
    state: "valid",
    fields: { code, name, quantity },
    productId: product.id,
    quoteId: quote.id,
  };
}

function productOption(object: DataObject): ProcurementProductOption {
  return {
    id: object.id,
    code: textValue(object, "code"),
    name: textValue(object, "name"),
    category: textValue(object, "category"),
    referencePriceCny: textValue(object, "reference_price_cny"),
    performanceScore: textValue(object, "performance_score"),
    powerW: textValue(object, "power_w"),
  };
}

function quoteOption(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  object: DataObject,
): ProcurementQuoteOption {
  const supplierRelation = workspace.relations.find(
    (relation) =>
      relation.relationTypeCode === quoteOfferedBy &&
      relation.status === "active" &&
      relation.sourceId === object.id,
  );
  const supplier = workspace.objects.find(
    (candidate) => candidate.id === supplierRelation?.targetId,
  );
  return {
    id: object.id,
    code: textValue(object, "code"),
    name: textValue(object, "name"),
    status: object.status,
    unitPriceCny: textValue(object, "unit_price_cny"),
    inventoryQty: textValue(object, "inventory_qty"),
    deliveryDays: textValue(object, "delivery_days"),
    supplierName: supplier ? textValue(supplier, "name") : null,
  };
}

function quoteMatchesProduct(
  workspace: Pick<WorkspaceState, "relations">,
  quoteId: string,
  productId: string | null,
): boolean {
  return (
    productId !== null &&
    workspace.relations.some(
      (relation) =>
        relation.relationTypeCode === quoteForProduct &&
        relation.status === "active" &&
        relation.sourceId === quoteId &&
        relation.targetId === productId,
    )
  );
}

function activeRelationTarget(
  workspace: Pick<WorkspaceState, "relations">,
  sourceId: string,
  relationTypeCode: string,
): string | null {
  return (
    workspace.relations.find(
      (relation) =>
        relation.relationTypeCode === relationTypeCode &&
        relation.status === "active" &&
        relation.sourceId === sourceId,
    )?.targetId ?? null
  );
}

async function replaceProcurementItemRelations(input: {
  readonly workspace: WorkspaceStore;
  readonly itemId: string;
  readonly productId: string;
  readonly quoteId: string;
  readonly actor: MemberId;
  readonly completedSteps: readonly string[];
}): Promise<
  | { readonly state: "updated"; readonly completedSteps: readonly string[] }
  | Extract<ProcurementItemEditResult, { readonly state: "partial-failure" }>
> {
  const completedSteps = [...input.completedSteps];
  const currentProduct = activeRelationTarget(
    input.workspace.getSnapshot(),
    input.itemId,
    selectsProduct,
  );
  const currentQuote = activeRelationTarget(
    input.workspace.getSnapshot(),
    input.itemId,
    usesQuote,
  );
  const changes = [
    ...(currentQuote && currentQuote !== input.quoteId
      ? [
          {
            relationTypeCode: usesQuote,
            targetId: currentQuote,
            label: "解除旧供应商报价关系",
          },
        ]
      : []),
    ...(currentProduct && currentProduct !== input.productId
      ? [
          {
            relationTypeCode: selectsProduct,
            targetId: currentProduct,
            label: "解除旧硬件配件关系",
          },
        ]
      : []),
  ];
  for (const change of changes) {
    const relation = input.workspace
      .getRelations(input.itemId)
      .find(
        (candidate) =>
          candidate.relationTypeCode === change.relationTypeCode &&
          candidate.status === "active" &&
          candidate.targetId === change.targetId,
      );
    if (!relation) continue;
    input.workspace.unlinkRelation(relation.id, input.actor);
    const write = await input.workspace.waitForLastWrite();
    if (write.state === "failed") {
      return editPartialFailure(change.label, write, completedSteps);
    }
    completedSteps.push(change.label);
  }

  const additions = [
    ...(currentProduct !== input.productId
      ? [
          {
            relationTypeCode: selectsProduct,
            targetId: input.productId,
            label: "关联新硬件配件",
          },
        ]
      : []),
    ...(currentQuote !== input.quoteId
      ? [
          {
            relationTypeCode: usesQuote,
            targetId: input.quoteId,
            label: "关联新供应商报价",
          },
        ]
      : []),
  ];
  for (const addition of additions) {
    input.workspace.createRelation({
      relationTypeCode: addition.relationTypeCode,
      sourceId: input.itemId,
      targetId: addition.targetId,
      actor: input.actor,
      summary: addition.label,
    });
    const write = await input.workspace.waitForLastWrite();
    if (write.state === "failed") {
      return editPartialFailure(addition.label, write, completedSteps);
    }
    completedSteps.push(addition.label);
  }
  return { state: "updated", completedSteps };
}

function editPartialFailure(
  failedStep: string,
  completion: WriteCompletion,
  completedSteps: readonly string[],
): Extract<ProcurementItemEditResult, { readonly state: "partial-failure" }> {
  const message =
    completion.state === "failed" ? completion.message : "写入未完成";
  return {
    state: "partial-failure",
    failedStep,
    message: `${failedStep}失败：${message}。已完成步骤：${completedSteps.join("、") || "无"}。请重新加载工作空间后重试。`,
    completedSteps,
  };
}

function textValue(object: DataObject, fieldCode: string): string {
  const value = object.fields[fieldCode]?.value;
  return value === null || value === undefined ? "—" : String(value);
}

function resolvedObjectId(
  temporaryObjectId: string,
  completion: WriteCompletion,
): string {
  return completion.state === "synced" && completion.objectId
    ? completion.objectId
    : temporaryObjectId;
}

function partialFailure(
  failedStep: string,
  completion: WriteCompletion,
  completedSteps: readonly string[],
): ProcurementItemCreateResult {
  const message =
    completion.state === "failed" ? completion.message : "写入未完成";
  return {
    state: "partial-failure",
    failedStep,
    message: `${failedStep}失败：${message}。已完成的数据不会自动删除，请重新加载工作空间。`,
    completedSteps,
  };
}
