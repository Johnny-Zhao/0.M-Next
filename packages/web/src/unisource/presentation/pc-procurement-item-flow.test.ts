import { describe, expect, it, vi } from "vitest";

import type {
  DataFieldPrimitive,
  DataObject,
  DataRelation,
  MemberId,
} from "../model/kernel";
import { KernelWriteBridge } from "../data/write-bridge";
import type { UnisourceGateway } from "../data/gateway";
import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { SessionStore } from "../state/session-store";
import { WorkspaceStore, type WriteSink } from "../state/workspace-store";
import {
  buildProcurementItemFormModel,
  createInitialProcurementItemDraft,
  createProcurementItem,
  removeProcurementItemFromPlan,
  updateProcurementItem,
  validateProcurementItemEdit,
} from "./pc-procurement-item-flow";

describe("procurement item flow", () => {
  it("starts with quantity 1 and keeps compatible kernel-draft quotes selectable", () => {
    const workspace = fixtureWorkspace();
    const model = buildProcurementItemFormModel(
      workspace.getSnapshot(),
      "plan-1",
      "product-cpu",
    );

    expect(createInitialProcurementItemDraft().quantity).toBe(1);
    expect(model.products[0]).toMatchObject({
      code: "CPU-001",
      category: "CPU",
      referencePriceCny: "1699",
      performanceScore: "85",
      powerW: "125",
    });
    expect(model.quotes).toEqual([
      expect.objectContaining({ code: "QUOTE-CPU", supplierName: "供应商甲" }),
    ]);
  });

  it("excludes terminal products from maintenance choices", () => {
    const workspace = fixtureWorkspace();
    const archived = object(
      "product-archived",
      "hardware_product",
      productFields("CPU-OLD", "CPU", 1, 1, 1),
    );
    const snapshot = workspace.getSnapshot();
    const archivedState = {
      ...snapshot,
      objects: [
        ...snapshot.objects,
        { ...archived, status: "archived" as const },
      ],
    };
    const model = buildProcurementItemFormModel(archivedState, "plan-1", null);

    expect(model.products.some((product) => product.id === archived.id)).toBe(
      false,
    );
    expect(
      validateProcurementItemEdit(archivedState, "plan-1", "item-existing", {
        productId: archived.id,
        quoteId: "quote-cpu",
        quantity: 1,
      }),
    ).toMatchObject({ state: "invalid" });
  });

  it("rejects invalid drafts before any create command is sent", async () => {
    const workspace = fixtureWorkspace();
    const sink = createSink();
    workspace.setWriteSink(sink);
    const invalidDrafts = [
      { ...validDraft(), code: "" },
      { ...validDraft(), name: "" },
      { ...validDraft(), quantity: "1.5" },
      { ...validDraft(), quantity: "0" },
      { ...validDraft(), code: "ITEM-EXIST" },
      { ...validDraft(), code: "CPU-001" },
      { ...validDraft(), productId: null },
      { ...validDraft(), quoteId: null },
      { ...validDraft(), quoteId: "quote-gpu" },
      { ...validDraft(), quoteId: "quote-archived" },
    ];

    for (const draft of invalidDrafts) {
      const result = await createProcurementItem({
        planId: "plan-1",
        draft,
        workspace,
      });
      expect(result.state).toBe("validation-failed");
    }
    expect(sink.createObject).not.toHaveBeenCalled();
    expect(sink.createRelation).not.toHaveBeenCalled();
  });

  it("does not create a ChangeSet or local item when the member lacks edit permission", async () => {
    const workspace = fixtureWorkspace();
    const session = readonlySession(workspace);
    const before = workspace.getObjects("build_plan_item").length;

    const result = await createProcurementItem({
      planId: "plan-1",
      draft: validDraft(),
      workspace,
      session,
    });

    expect(result).toMatchObject({ state: "permission-denied" });
    expect(workspace.getObjects("build_plan_item")).toHaveLength(before);
  });

  it("creates only stored fields then writes the three required relations", async () => {
    const workspace = fixtureWorkspace();
    const sink = createSink();
    workspace.setWriteSink(sink);

    const result = await createProcurementItem({
      planId: "plan-1",
      draft: validDraft(),
      workspace,
      session: allowedMockSession(workspace),
    });

    expect(result).toMatchObject({ state: "created" });
    if (result.state !== "created") throw new Error("expected created item");
    const item = workspace.getObject(result.itemId)!;
    expect(item.objectTypeCode).toBe("build_plan_item");
    expect(Object.keys(item.fields)).toEqual(["code", "name", "quantity"]);
    expect(item.fields.quantity?.value).toBe(2);
    expect(sink.createObject).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          objectTypeCode: "build_plan_item",
          fields: { code: "ITEM-NEW", name: "新增 CPU 明细", quantity: 2 },
        }),
      }),
    );
    expect(sink.createRelation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        params: expect.objectContaining({
          relationTypeCode: "build_plan_contains_item",
          sourceId: "plan-1",
          targetId: result.itemId,
        }),
      }),
    );
    expect(sink.createRelation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        params: expect.objectContaining({
          relationTypeCode: "build_plan_item_selects_product",
          sourceId: result.itemId,
          targetId: "product-cpu",
        }),
      }),
    );
    expect(sink.createRelation).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        params: expect.objectContaining({
          relationTypeCode: "build_plan_item_uses_supplier_quote",
          sourceId: result.itemId,
          targetId: "quote-cpu",
        }),
      }),
    );
    expect(
      workspace
        .getRelations()
        .filter((relation) => relation.sourceId === result.itemId)
        .map((relation) => [relation.relationTypeCode, relation.targetId]),
    ).toEqual([
      ["build_plan_item_uses_supplier_quote", "quote-cpu"],
      ["build_plan_item_selects_product", "product-cpu"],
    ]);
    expect(
      workspace
        .getRelations()
        .some(
          (relation) =>
            relation.relationTypeCode === "build_plan_contains_item" &&
            relation.sourceId === "plan-1" &&
            relation.targetId === result.itemId,
        ),
    ).toBe(true);
  });

  it("uses the write bridge to replace the temporary item id and refresh plan and item", async () => {
    const workspace = fixtureWorkspace();
    const gateway = new FlowGateway(workspace);
    const bridge = new KernelWriteBridge(gateway, { workspace });
    workspace.setWriteSink(bridge);

    const result = await createProcurementItem({
      planId: "plan-1",
      draft: validDraft(),
      workspace,
      session: allowedKernelSession(workspace),
    });

    expect(result).toMatchObject({
      state: "created",
      itemId: "kernel-item-new",
    });
    expect(workspace.getObject("kernel-item-new")).toBeDefined();
    expect(
      workspace
        .getRelations()
        .every(
          (relation) =>
            relation.relationTypeCode !== "build_plan_contains_item" ||
            relation.targetId !== "obj-build_plan_item-1",
        ),
    ).toBe(true);
    expect(gateway.relationCalls).toEqual([
      ["build_plan_contains_item", "plan-1", "kernel-item-new"],
      ["build_plan_item_selects_product", "kernel-item-new", "product-cpu"],
      ["build_plan_item_uses_supplier_quote", "kernel-item-new", "quote-cpu"],
    ]);
    expect(gateway.refreshObjectCalls).toContain("plan-1");
    expect(gateway.refreshObjectCalls).toContain("kernel-item-new");
    expect(gateway.refreshObjectCalls).toContain("product-cpu");
    expect(gateway.refreshObjectCalls).toContain("quote-cpu");
  });

  it("keeps completed writes visible and reports the failed step", async () => {
    const workspace = fixtureWorkspace();
    const gateway = new FlowGateway(
      workspace,
      "build_plan_item_selects_product",
    );
    workspace.setWriteSink(new KernelWriteBridge(gateway, { workspace }));

    const result = await createProcurementItem({
      planId: "plan-1",
      draft: validDraft(),
      workspace,
      session: allowedKernelSession(workspace),
    });

    expect(result).toMatchObject({
      state: "partial-failure",
      failedStep: "关联明细与配件",
      completedSteps: ["创建明细对象", "关联方案与明细"],
    });
    expect(workspace.getObject("kernel-item-new")).toBeDefined();
    expect(
      workspace
        .getRelations()
        .some(
          (relation) =>
            relation.relationTypeCode === "build_plan_contains_item",
        ),
    ).toBe(true);
    expect(
      workspace
        .getRelations()
        .some(
          (relation) =>
            relation.relationTypeCode === "build_plan_item_selects_product" &&
            relation.sourceId === "kernel-item-new",
        ),
    ).toBe(false);
  });

  it("updates quantity through the field write path", async () => {
    const workspace = fixtureWorkspace();
    const refreshObjects = vi.fn(() =>
      Promise.resolve({ state: "synced" as const }),
    );
    workspace.setWriteSink({ ...createSink(), refreshObjects });
    const result = await updateProcurementItem({
      planId: "plan-1",
      itemId: "item-existing",
      draft: { productId: "product-cpu", quoteId: "quote-cpu", quantity: 3 },
      workspace,
      session: allowedMockSession(workspace),
    });

    expect(result.state).toBe("updated");
    expect(workspace.getObject("item-existing")?.fields.quantity?.value).toBe(
      3,
    );
    expect(refreshObjects).toHaveBeenCalledWith(
      expect.arrayContaining(["plan-1", "item-existing"]),
    );
  });

  it("rejects zero, negative, fractional and non-numeric quantities", () => {
    const workspace = fixtureWorkspace();
    for (const quantity of [0, -1, 1.5, "not-a-number"]) {
      expect(
        validateProcurementItemEdit(
          workspace.getSnapshot(),
          "plan-1",
          "item-existing",
          {
            productId: "product-cpu",
            quoteId: "quote-cpu",
            quantity,
          },
        ),
      ).toMatchObject({ state: "invalid" });
    }
  });

  it("requires a matching quote when changing product", () => {
    const workspace = fixtureWorkspace();
    expect(
      validateProcurementItemEdit(
        workspace.getSnapshot(),
        "plan-1",
        "item-existing",
        {
          productId: "product-gpu",
          quoteId: "quote-cpu",
          quantity: 1,
        },
      ),
    ).toEqual({ state: "invalid", message: "供应商报价与硬件配件不匹配" });
  });

  it("replaces product and quote relations without deleting source objects", async () => {
    const workspace = fixtureWorkspace();
    const result = await updateProcurementItem({
      planId: "plan-1",
      itemId: "item-existing",
      draft: { productId: "product-gpu", quoteId: "quote-gpu", quantity: 1 },
      workspace,
      session: allowedMockSession(workspace),
    });

    expect(result.state).toBe("updated");
    expect(
      activeTarget(
        workspace,
        "item-existing",
        "build_plan_item_selects_product",
      ),
    ).toBe("product-gpu");
    expect(
      activeTarget(
        workspace,
        "item-existing",
        "build_plan_item_uses_supplier_quote",
      ),
    ).toBe("quote-gpu");
    expect(workspace.getObject("product-cpu")).toBeDefined();
    expect(workspace.getObject("quote-cpu")).toBeDefined();
  });

  it("unlinks an item from the plan without deleting the item, product or quote", async () => {
    const workspace = fixtureWorkspace();
    const result = await removeProcurementItemFromPlan({
      planId: "plan-1",
      itemId: "item-existing",
      workspace,
      session: allowedMockSession(workspace),
    });

    expect(result.state).toBe("removed");
    expect(
      activeTarget(workspace, "plan-1", "build_plan_contains_item"),
    ).toBeNull();
    expect(workspace.getObject("item-existing")).toBeDefined();
    expect(workspace.getObject("product-cpu")).toBeDefined();
    expect(workspace.getObject("quote-cpu")).toBeDefined();
  });

  it("reports a partial failure after an old relation was unlinked", async () => {
    const workspace = fixtureWorkspace();
    workspace.setWriteSink({
      ...createSink(),
      createRelation: vi.fn((descriptor) => {
        workspace.removeRelation(descriptor.temporaryRelationId);
        return Promise.resolve({
          state: "failed" as const,
          message: "后端拒绝新关系",
        });
      }),
    });
    const result = await updateProcurementItem({
      planId: "plan-1",
      itemId: "item-existing",
      draft: { productId: "product-gpu", quoteId: "quote-gpu", quantity: 1 },
      workspace,
      session: allowedMockSession(workspace),
    });

    expect(result).toMatchObject({
      state: "partial-failure",
      failedStep: "关联新硬件配件",
    });
    expect(
      activeTarget(
        workspace,
        "item-existing",
        "build_plan_item_selects_product",
      ),
    ).toBeNull();
  });

  it("does not send writes when the member lacks maintenance permission", async () => {
    const workspace = fixtureWorkspace();
    const sink = createSink();
    workspace.setWriteSink(sink);
    const result = await updateProcurementItem({
      planId: "plan-1",
      itemId: "item-existing",
      draft: { productId: "product-cpu", quoteId: "quote-cpu", quantity: 2 },
      workspace,
      session: readonlySession(workspace),
    });

    expect(result.state).toBe("permission-denied");
    expect(sink.updateField).not.toHaveBeenCalled();
    expect(sink.createRelation).not.toHaveBeenCalled();
    expect(sink.unlinkRelation).not.toHaveBeenCalled();
  });
});

function validDraft() {
  return {
    code: "ITEM-NEW",
    name: "新增 CPU 明细",
    productId: "product-cpu",
    quoteId: "quote-cpu",
    quantity: "2",
  };
}

function activeTarget(
  workspace: WorkspaceStore,
  sourceId: string,
  relationTypeCode: string,
): string | null {
  return (
    workspace
      .getRelations(sourceId)
      .find(
        (relation) =>
          relation.relationTypeCode === relationTypeCode &&
          relation.status === "active",
      )?.targetId ?? null
  );
}

function fixtureWorkspace(): WorkspaceStore {
  const seed = cloneDemoSeed();
  return new WorkspaceStore({
    ...seed,
    permissions: {
      ...seed.permissions,
      wangyun: { ...seed.permissions.wangyun, build_plan_item: "edit" },
    },
    objects: [
      object("plan-1", "build_plan", { code: "PLAN-001", name: "方案一" }),
      object("item-existing", "build_plan_item", {
        code: "ITEM-EXIST",
        name: "已有明细",
        quantity: 1,
      }),
      object(
        "product-cpu",
        "hardware_product",
        productFields("CPU-001", "CPU", 1699, 85, 125),
      ),
      object(
        "product-gpu",
        "hardware_product",
        productFields("GPU-001", "GPU", 2999, 90, 220),
      ),
      object("supplier-1", "supplier", { code: "SUP-001", name: "供应商甲" }),
      {
        ...object("quote-cpu", "supplier_quote", quoteFields("QUOTE-CPU")),
        status: "draft",
      },
      object("quote-gpu", "supplier_quote", quoteFields("QUOTE-GPU")),
      {
        ...object("quote-archived", "supplier_quote", quoteFields("QUOTE-OLD")),
        status: "archived",
      },
    ],
    relations: [
      relation(
        "plan-item-existing",
        "build_plan_contains_item",
        "plan-1",
        "item-existing",
      ),
      relation(
        "item-existing-product",
        "build_plan_item_selects_product",
        "item-existing",
        "product-cpu",
      ),
      relation(
        "item-existing-quote",
        "build_plan_item_uses_supplier_quote",
        "item-existing",
        "quote-cpu",
      ),
      relation(
        "quote-cpu-product",
        "supplier_quote_for_product",
        "quote-cpu",
        "product-cpu",
      ),
      relation(
        "quote-gpu-product",
        "supplier_quote_for_product",
        "quote-gpu",
        "product-gpu",
      ),
      relation(
        "quote-cpu-supplier",
        "supplier_quote_offered_by_supplier",
        "quote-cpu",
        "supplier-1",
      ),
      relation(
        "quote-archived-product",
        "supplier_quote_for_product",
        "quote-archived",
        "product-cpu",
      ),
    ],
  });
}

function createSink(): WriteSink {
  return {
    updateField: vi.fn(),
    createObject: vi.fn(),
    createRelation: vi.fn(),
    unlinkRelation: vi.fn(),
    deleteObject: vi.fn(),
  };
}

function readonlySession(workspace: WorkspaceStore): SessionStore {
  const seed = cloneDemoSeed();
  const changes = new ChangeSetStore(seed, workspace);
  const session = new SessionStore(workspace, changes);
  session.switchMember("chenmo");
  return session;
}

function allowedMockSession(workspace: WorkspaceStore): SessionStore {
  return new SessionStore(
    workspace,
    new ChangeSetStore(cloneDemoSeed(), workspace),
  );
}

function allowedKernelSession(workspace: WorkspaceStore): SessionStore {
  const session = allowedMockSession(workspace);
  session.setPermissionSource("kernel");
  return session;
}

function productFields(
  code: string,
  category: string,
  referencePriceCny: number,
  performanceScore: number,
  powerW: number,
): Record<string, DataFieldPrimitive> {
  return {
    code,
    name: `${category} 产品`,
    category,
    reference_price_cny: referencePriceCny,
    performance_score: performanceScore,
    power_w: powerW,
  };
}

function quoteFields(code: string): Record<string, DataFieldPrimitive> {
  return {
    code,
    name: `${code} 报价`,
    unit_price_cny: 1599,
    inventory_qty: 20,
    delivery_days: 3,
  };
}

function object(
  id: string,
  objectTypeCode: string,
  fields: Record<string, DataFieldPrimitive>,
): DataObject {
  const at = "2026-07-15T10:00:00+08:00";
  return {
    id,
    objectTypeCode,
    status: "active",
    version: 1,
    fields: Object.fromEntries(
      Object.entries(fields).map(([code, value]) => [
        code,
        {
          value,
          fieldVersion: 1,
          updatedBy: "wangyun",
          updatedAt: at,
          source: "manual",
        },
      ]),
    ),
    createdBy: "wangyun",
    createdAt: at,
    updatedBy: "wangyun",
    updatedAt: at,
  };
}

function relation(
  id: string,
  relationTypeCode: string,
  sourceId: string,
  targetId: string,
): DataRelation {
  return {
    id,
    relationTypeCode,
    sourceId,
    targetId,
    status: "active",
    fields: {},
    version: 1,
    annotationIds: [],
  };
}

class FlowGateway
  implements
    Pick<
      UnisourceGateway,
      | "setActor"
      | "updateField"
      | "createObject"
      | "createRelation"
      | "unlinkRelation"
      | "deleteObject"
    >
{
  readonly refreshObjectCalls: string[] = [];
  readonly relationCalls: [string, string, string][] = [];
  private relationSequence = 0;

  constructor(
    private readonly workspace: WorkspaceStore,
    private readonly failingRelationType?: string,
  ) {}

  setActor(actor: MemberId): void {
    void actor;
  }

  updateField(
    ..._args: Parameters<UnisourceGateway["updateField"]>
  ): ReturnType<UnisourceGateway["updateField"]> {
    void _args;
    return Promise.reject(new Error("not used"));
  }

  async createObject(
    params: Parameters<UnisourceGateway["createObject"]>[0],
  ): Promise<DataObject> {
    return object("kernel-item-new", params.objectTypeCode, params.fields);
  }

  async createRelation(
    params: Parameters<UnisourceGateway["createRelation"]>[0],
  ): Promise<{ readonly relation: DataRelation }> {
    this.relationCalls.push([
      params.relationTypeCode,
      params.sourceId,
      params.targetId,
    ]);
    if (params.relationTypeCode === this.failingRelationType) {
      throw new Error("关系写入失败");
    }
    this.relationSequence += 1;
    return {
      relation: relation(
        `kernel-relation-${this.relationSequence}`,
        params.relationTypeCode,
        params.sourceId,
        params.targetId,
      ),
    };
  }

  async unlinkRelation(
    params: Parameters<UnisourceGateway["unlinkRelation"]>[0],
  ): Promise<{ readonly relation: DataRelation }> {
    return {
      relation: {
        ...params.relation,
        status: "unlinked",
        version: params.expectedVersion + 1,
      },
    };
  }

  async deleteObject(
    ...args: Parameters<UnisourceGateway["deleteObject"]>
  ): Promise<DataObject> {
    const [objectId] = args;
    return this.workspace.getObject(objectId)!;
  }

  async refreshObject(objectId: string): Promise<DataObject> {
    this.refreshObjectCalls.push(objectId);
    return this.workspace.getObject(objectId)!;
  }
}
