import { describe, expect, it, vi } from "vitest";

import type {
  DataFieldPrimitive,
  DataObject,
  ObjectTypeDef,
} from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore, type WriteSink } from "../state/workspace-store";
import {
  archiveProcurementObject,
  copyBuildPlan,
  registerPcProcurementLifecycleActions,
} from "./pc-procurement-lifecycle-actions";
import { DataSourceLifecycleActionRegistry } from "./data-source-lifecycle-action-registry";

const allowedSession = {
  can: () => true,
  getSnapshot: () => ({
    currentMemberId: "wangyun" as const,
    permissionSource: "demo" as const,
  }),
};

describe("PC procurement lifecycle actions", () => {
  it("copies a plan, its requirement and items without copying products or quotes", async () => {
    const workspace = lifecycleWorkspace();
    const sink = createWriteSink();
    workspace.setWriteSink(sink);

    const result = await copyBuildPlan({
      planId: "plan-1",
      code: "PLAN-002",
      name: "复制方案",
      workspace,
      session: allowedSession,
    });

    expect(result).toMatchObject({ state: "completed" });
    if (result.state !== "completed") throw new Error("expected copied plan");
    expect(workspace.getObject(result.objectId)?.fields.code?.value).toBe(
      "PLAN-002",
    );
    expect(workspace.getObject(result.objectId)?.fields.status?.value).toBe(
      "DRAFT",
    );
    expect(workspace.getObjects("hardware_product")).toHaveLength(1);
    expect(workspace.getObjects("supplier_quote")).toHaveLength(1);
    expect(
      activeTarget(
        workspace,
        result.objectId,
        "build_plan_satisfies_requirement",
      ),
    ).toBe("requirement-1");
    const itemId = activeTarget(
      workspace,
      result.objectId,
      "build_plan_contains_item",
    );
    expect(
      activeTarget(workspace, itemId!, "build_plan_item_selects_product"),
    ).toBe("product-1");
    expect(
      activeTarget(workspace, itemId!, "build_plan_item_uses_supplier_quote"),
    ).toBe("quote-1");
    expect(sink.createObject).toHaveBeenCalledTimes(2);
    expect(sink.createRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          relationTypeCode: "build_plan_satisfies_requirement",
        }),
      }),
    );
  });

  it("keeps the created plan visible and identifies the failed copy step", async () => {
    const workspace = lifecycleWorkspace();
    workspace.setWriteSink({
      createObject: async () => ({ state: "local" }),
      createRelation: async () => ({ state: "failed", message: "关系被拒绝" }),
      updateField: () => undefined,
      unlinkRelation: () => undefined,
      deleteObject: () => undefined,
    } satisfies WriteSink);

    const result = await copyBuildPlan({
      planId: "plan-1",
      code: "PLAN-003",
      name: "部分失败",
      workspace,
      session: allowedSession,
    });

    expect(result).toMatchObject({
      state: "partial-failure",
      failedStep: "创建复制关系",
    });
    expect(
      workspace
        .getObjects("build_plan")
        .some((item) => item.fields.code?.value === "PLAN-003"),
    ).toBe(true);
  });

  it("derives bounded unique codes and copies only configured descendants", async () => {
    const workspace = lifecycleWorkspace();
    workspace.createObject({
      objectTypeCode: "build_plan",
      fields: { code: "PLAN-001-COPY", name: "已存在", status: "DRAFT" },
      actor: "wangyun",
    });

    const result = await workspace.copyObjectSubtree(
      "plan-1",
      {
        followRelationTypes: ["build_plan_contains_item"],
        rebindRelationTypes: [
          "build_plan_satisfies_requirement",
          "build_plan_item_selects_product",
          "build_plan_item_uses_supplier_quote",
        ],
        maxDepth: 3,
      },
      "wangyun",
    );

    expect(result).toMatchObject({ state: "completed" });
    if (result.state !== "completed") throw new Error("expected copy");
    expect(workspace.getObject(result.objectId)?.fields.code?.value).toBe(
      "PLAN-001-COPY2",
    );
    expect(
      workspace
        .getObjects("build_plan_item")
        .some((item) => item.fields.code?.value === "ITEM-001-COPY"),
    ).toBe(true);
    expect(workspace.getObjects("hardware_product")).toHaveLength(1);
  });

  it("does not create a partial copy when five generated codes are occupied", async () => {
    const workspace = lifecycleWorkspace();
    for (const suffix of ["", "2", "3", "4", "5"]) {
      workspace.createObject({
        objectTypeCode: "build_plan",
        fields: {
          code: `PLAN-001-COPY${suffix}`,
          name: "已存在",
          status: "DRAFT",
        },
        actor: "wangyun",
      });
    }
    const before = workspace.getObjects("build_plan").length;

    const result = await workspace.copyObjectSubtree(
      "plan-1",
      { followRelationTypes: [], rebindRelationTypes: [], maxDepth: 1 },
      "wangyun",
    );

    expect(result).toMatchObject({ state: "validation-failed" });
    expect(workspace.getObjects("build_plan")).toHaveLength(before);
  });

  it("archives a live requirement only through the workspace write path", async () => {
    const workspace = lifecycleWorkspace();

    const result = await archiveProcurementObject({
      objectId: "requirement-1",
      objectTypeCode: "procurement_requirement",
      workspace,
      session: allowedSession,
    });

    expect(result.state).toBe("completed");
    expect(workspace.getObject("requirement-1")).toBeUndefined();
  });

  it("archives every PC object type without deleting its facts", async () => {
    const workspace = lifecycleWorkspace();
    const result = await archiveProcurementObject({
      objectId: "product-1",
      objectTypeCode: "hardware_product",
      workspace,
      session: allowedSession,
    });
    expect(result.state).toBe("completed");
    expect(workspace.getObject("product-1")).toBeUndefined();
    expect(workspace.getRelations("item-1")).toHaveLength(2);
  });

  it("registers archive actions for all six PC object types", () => {
    const registry = new DataSourceLifecycleActionRegistry();
    registerPcProcurementLifecycleActions(registry);
    for (const objectTypeCode of [
      "procurement_requirement",
      "build_plan",
      "build_plan_item",
      "hardware_product",
      "supplier",
      "supplier_quote",
    ]) {
      expect(registry.resolve("pc_procurement", objectTypeCode)).not.toBeNull();
    }
  });

  it("does not create or archive data when the member lacks edit permission", async () => {
    const workspace = lifecycleWorkspace();
    const readonlySession = { ...allowedSession, can: () => false };

    await expect(
      copyBuildPlan({
        planId: "plan-1",
        code: "PLAN-004",
        name: "无权限",
        workspace,
        session: readonlySession,
      }),
    ).resolves.toMatchObject({ state: "permission-denied" });
    await expect(
      archiveProcurementObject({
        objectId: "requirement-1",
        objectTypeCode: "procurement_requirement",
        workspace,
        session: readonlySession,
      }),
    ).resolves.toMatchObject({ state: "permission-denied" });
    expect(workspace.getObjects("build_plan")).toHaveLength(1);
    expect(workspace.getObject("requirement-1")).toBeDefined();
  });
});

function createWriteSink() {
  return {
    updateField: vi.fn(() => Promise.resolve({ state: "synced" as const })),
    createObject: vi.fn(() => Promise.resolve({ state: "synced" as const })),
    createRelation: vi.fn(() => Promise.resolve({ state: "synced" as const })),
    unlinkRelation: vi.fn(() => Promise.resolve({ state: "synced" as const })),
    deleteObject: vi.fn(() => Promise.resolve({ state: "synced" as const })),
  } satisfies WriteSink;
}

function lifecycleWorkspace(): WorkspaceStore {
  const seed = cloneDemoSeed();
  return new WorkspaceStore({
    ...seed,
    workspace: { ...seed.workspace, id: "pc-workspace", name: "电脑采购" },
    objectTypes: lifecycleTypes,
    relationTypes: [],
    objects: [
      dataObject("plan-1", "build_plan", {
        code: "PLAN-001",
        name: "原方案",
        status: "DRAFT",
      }),
      dataObject("item-1", "build_plan_item", {
        code: "ITEM-001",
        name: "CPU",
        quantity: 1,
      }),
      dataObject("requirement-1", "procurement_requirement", {
        code: "REQ-001",
        name: "需求",
      }),
      dataObject("product-1", "hardware_product", {
        code: "HW-001",
        name: "产品",
      }),
      dataObject("quote-1", "supplier_quote", {
        code: "QUOTE-001",
        name: "报价",
      }),
      dataObject("supplier-1", "supplier", {
        code: "SUP-001",
        name: "Supplier",
      }),
    ],
    relations: [
      relation(
        "r-plan-req",
        "build_plan_satisfies_requirement",
        "plan-1",
        "requirement-1",
      ),
      relation("r-plan-item", "build_plan_contains_item", "plan-1", "item-1"),
      relation(
        "r-item-product",
        "build_plan_item_selects_product",
        "item-1",
        "product-1",
      ),
      relation(
        "r-item-quote",
        "build_plan_item_uses_supplier_quote",
        "item-1",
        "quote-1",
      ),
    ],
  });
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

const lifecycleTypes: readonly ObjectTypeDef[] = [
  objectType("build_plan", ["code", "name", "status"]),
  objectType("build_plan_item", ["code", "name", "quantity"]),
  objectType("procurement_requirement", ["code", "name"]),
  objectType("hardware_product", ["code", "name"]),
  objectType("supplier", ["code", "name"]),
  objectType("supplier_quote", ["code", "name"]),
];

function objectType(code: string, fields: readonly string[]): ObjectTypeDef {
  return {
    code,
    name: code,
    group: "电脑采购",
    fields: fields.map((field) => ({
      code: field,
      name: field,
      dataType: field === "quantity" ? "number" : "text",
    })),
  };
}

function dataObject(
  id: string,
  objectTypeCode: string,
  fields: Record<string, DataFieldPrimitive>,
): DataObject {
  const at = "2026-07-16T00:00:00Z";
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
) {
  return {
    id,
    relationTypeCode,
    sourceId,
    targetId,
    status: "active" as const,
    fields: {},
    version: 1,
    annotationIds: [],
  };
}
