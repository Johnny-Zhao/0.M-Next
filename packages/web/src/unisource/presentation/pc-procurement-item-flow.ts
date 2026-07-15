import type { DataFieldPrimitive, DataObject } from "../model/kernel";
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

export function createInitialProcurementItemDraft(): ProcurementItemDraft {
  return { code: "", name: "", productId: null, quoteId: null, quantity: 1 };
}

export function buildProcurementItemFormModel(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  planId: string,
  selectedProductId: string | null,
): ProcurementItemFormModel {
  const products = workspace.objects
    .filter((object) => object.objectTypeCode === "hardware_product")
    .map(productOption);
  const quotes = workspace.objects
    .filter(
      (object) =>
        object.objectTypeCode === "supplier_quote" &&
        object.status === "active",
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
  if (
    workspace.objects.some(
      (object) =>
        object.objectTypeCode === "build_plan_item" &&
        textValue(object, "code") === code,
    )
  ) {
    return { state: "invalid", message: "明细编码已存在，请使用其他编码" };
  }
  if (!draft.productId) return { state: "invalid", message: "请选择硬件配件" };
  if (!draft.quoteId) return { state: "invalid", message: "请选择供应商报价" };
  const product = workspace.objects.find(
    (object) =>
      object.id === draft.productId &&
      object.objectTypeCode === "hardware_product",
  );
  if (!product) return { state: "invalid", message: "所选硬件配件不可用" };
  const quote = workspace.objects.find(
    (object) =>
      object.id === draft.quoteId && object.objectTypeCode === "supplier_quote",
  );
  if (!quote || quote.status !== "active") {
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
