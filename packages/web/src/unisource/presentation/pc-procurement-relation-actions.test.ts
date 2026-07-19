import { describe, expect, it, vi } from "vitest";

import type { DataFieldPrimitive, DataObject } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { SessionStore } from "../state/session-store";
import { WorkspaceStore, type WriteSink } from "../state/workspace-store";
import { DataSourceRelationActionRegistry } from "./data-source-relation-action-registry";
import {
  initialProcurementQuoteRelationDraft,
  pcProcurementRelationActionId,
  procurementQuoteRelationOptions,
  registerPcProcurementRelationActions,
  updateBuildPlanRequirement,
  updateSupplierQuoteRelations,
} from "./pc-procurement-relation-actions";

describe("pc procurement data source relation actions", () => {
  it("registers scoped actions without affecting other profiles", () => {
    const registry = new DataSourceRelationActionRegistry();
    registerPcProcurementRelationActions(registry);
    registerPcProcurementRelationActions(registry);
    expect(registry.resolve("pc_procurement", "supplier_quote")).not.toBeNull();
    expect(registry.resolve("hardware_products", "supplier_quote")).toBeNull();
    expect(pcProcurementRelationActionId).toBe(
      "pc_procurement.maintain-relations",
    );
  });

  it("only offers live product and supplier targets", () => {
    const workspace = fixture();
    const options = procurementQuoteRelationOptions(workspace.getSnapshot());
    expect(options.products.map((item) => item.id)).toEqual(["product-1"]);
    expect(options.suppliers.map((item) => item.id)).toEqual(["supplier-1"]);
  });

  it("creates and replaces the two real supplier quote relations", async () => {
    const workspace = fixture();
    const result = await updateSupplierQuoteRelations({
      quoteId: "quote-1",
      draft: { productId: "product-1", supplierId: "supplier-1" },
      workspace,
      session: allowedSession(workspace),
    });
    expect(result.state).toBe("updated");
    expect(
      initialProcurementQuoteRelationDraft(workspace.getSnapshot(), "quote-1"),
    ).toEqual({
      productId: "product-1",
      supplierId: "supplier-1",
    });
  });

  it("rejects terminal relation targets before writing", async () => {
    const workspace = fixture();
    const sink = createSink();
    workspace.setWriteSink(sink);
    const result = await updateSupplierQuoteRelations({
      quoteId: "quote-1",
      draft: { productId: "product-archived", supplierId: "supplier-1" },
      workspace,
      session: allowedSession(workspace),
    });
    expect(result.state).toBe("validation-failed");
    expect(sink.createRelation).not.toHaveBeenCalled();
  });

  it("replaces a plan requirement through unlink then create", async () => {
    const workspace = fixture();
    workspace.createRelation({
      relationTypeCode: "build_plan_satisfies_requirement",
      sourceId: "plan-1",
      targetId: "requirement-1",
      actor: "wangyun",
    });
    const result = await updateBuildPlanRequirement({
      planId: "plan-1",
      requirementId: "requirement-2",
      workspace,
      session: allowedSession(workspace),
    });
    expect(result.state).toBe("updated");
    expect(
      activeTarget(workspace, "plan-1", "build_plan_satisfies_requirement"),
    ).toBe("requirement-2");
  });

  it("unlinks the current plan requirement without deleting the requirement", async () => {
    const workspace = fixture();
    workspace.createRelation({
      relationTypeCode: "build_plan_satisfies_requirement",
      sourceId: "plan-1",
      targetId: "requirement-1",
      actor: "wangyun",
    });

    const result = await updateBuildPlanRequirement({
      planId: "plan-1",
      requirementId: null,
      workspace,
      session: allowedSession(workspace),
    });

    expect(result.state).toBe("updated");
    expect(
      activeTarget(workspace, "plan-1", "build_plan_satisfies_requirement"),
    ).toBeNull();
    expect(workspace.getObject("requirement-1")).toBeDefined();
  });

  it("does not write relations for members without edit permission", async () => {
    const workspace = fixture();
    const sink = createSink();
    workspace.setWriteSink(sink);
    const session = allowedSession(workspace);
    session.switchMember("zhouran");
    const result = await updateSupplierQuoteRelations({
      quoteId: "quote-1",
      draft: { productId: "product-1", supplierId: "supplier-1" },
      workspace,
      session,
    });
    expect(result.state).toBe("permission-denied");
    expect(sink.createRelation).not.toHaveBeenCalled();
  });

  it("reports the failed quote relation step without pretending to roll back", async () => {
    const workspace = fixture();
    let calls = 0;
    workspace.setWriteSink({
      ...createSink(),
      createRelation: vi.fn(() => {
        calls += 1;
        return calls === 2
          ? Promise.resolve({
              state: "failed" as const,
              message: "后端拒绝关系",
            })
          : Promise.resolve({ state: "synced" as const });
      }),
    });
    const result = await updateSupplierQuoteRelations({
      quoteId: "quote-1",
      draft: { productId: "product-1", supplierId: "supplier-1" },
      workspace,
      session: allowedSession(workspace),
    });
    expect(result).toMatchObject({
      state: "partial-failure",
      failedStep: "关联报价与供应商",
    });
    expect(
      activeTarget(workspace, "quote-1", "supplier_quote_for_product"),
    ).toBeTruthy();
  });
});

function fixture(): WorkspaceStore {
  const seed = cloneDemoSeed();
  return new WorkspaceStore({
    ...seed,
    permissions: {
      ...seed.permissions,
      wangyun: {
        ...seed.permissions.wangyun,
        build_plan: "edit",
        supplier_quote: "edit",
      },
    },
    objects: [
      object("plan-1", "build_plan", { code: "PLAN-1", name: "方案" }),
      object("requirement-1", "procurement_requirement", {
        code: "REQ-1",
        name: "需求一",
      }),
      object("requirement-2", "procurement_requirement", {
        code: "REQ-2",
        name: "需求二",
      }),
      object("product-1", "hardware_product", { code: "HW-1", name: "配件" }),
      object(
        "product-archived",
        "hardware_product",
        { code: "HW-OLD", name: "旧配件" },
        "archived",
      ),
      object("supplier-1", "supplier", { code: "SUP-1", name: "供应商" }),
      object(
        "supplier-archived",
        "supplier",
        { code: "SUP-OLD", name: "旧供应商" },
        "archived",
      ),
      object("quote-1", "supplier_quote", { code: "QUOTE-1", name: "报价" }),
    ],
  });
}

function allowedSession(workspace: WorkspaceStore): SessionStore {
  return new SessionStore(
    workspace,
    new ChangeSetStore(cloneDemoSeed(), workspace),
  );
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

function createSink(): WriteSink {
  return {
    updateField: vi.fn(),
    createObject: vi.fn(),
    createRelation: vi.fn(),
    unlinkRelation: vi.fn(),
    deleteObject: vi.fn(),
  };
}

function object(
  id: string,
  objectTypeCode: string,
  fields: Record<string, DataFieldPrimitive>,
  status: DataObject["status"] = "active",
): DataObject {
  const at = "2026-07-16T10:00:00+08:00";
  return {
    id,
    objectTypeCode,
    status,
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
