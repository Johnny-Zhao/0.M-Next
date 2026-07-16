import { describe, expect, it, vi } from "vitest";

import type { DataFieldPrimitive, DataObject } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { SessionStore } from "../state/session-store";
import { WorkspaceStore, type WriteSink } from "../state/workspace-store";
import { DataSourceCreateActionRegistry } from "./data-source-create-action-registry";
import {
  bindBuildPlanRequirement,
  buildPlanRequirementOptions,
  pcProcurementBuildPlanCreateActionId,
  registerPcProcurementSourceActions,
} from "./pc-procurement-source-actions";

describe("pc procurement build plan create action", () => {
  it("only offers live requirements from the current workspace", () => {
    const workspace = fixtureWorkspace();
    expect(buildPlanRequirementOptions(workspace.getSnapshot())).toEqual([
      { id: "requirement-1", code: "REQ-001", name: "工作站需求" },
    ]);
  });

  it("binds a real requirement through WorkspaceStore relation writing", async () => {
    const workspace = fixtureWorkspace();
    const result = await bindBuildPlanRequirement({
      planId: "plan-new",
      requirementId: "requirement-1",
      workspace,
      session: allowedSession(workspace),
    });

    expect(result.state).toBe("bound");
    expect(
      workspace
        .getRelations()
        .some(
          (relation) =>
            relation.relationTypeCode === "build_plan_satisfies_requirement" &&
            relation.sourceId === "plan-new" &&
            relation.targetId === "requirement-1",
        ),
    ).toBe(true);
  });

  it("rejects an empty requirement without sending a relation command", async () => {
    const workspace = fixtureWorkspace();
    const sink = createSink();
    workspace.setWriteSink(sink);

    const result = await bindBuildPlanRequirement({
      planId: "plan-new",
      requirementId: null,
      workspace,
      session: allowedSession(workspace),
    });

    expect(result).toEqual({
      state: "validation-failed",
      message: "请选择一个采购需求",
    });
    expect(sink.createRelation).not.toHaveBeenCalled();
  });

  it("keeps the plan and reports a partial failure when binding fails", async () => {
    const workspace = fixtureWorkspace();
    workspace.setWriteSink({
      ...createSink(),
      createRelation: vi.fn(() =>
        Promise.resolve({ state: "failed" as const, message: "后端拒绝关系" }),
      ),
    });

    const result = await bindBuildPlanRequirement({
      planId: "plan-new",
      requirementId: "requirement-1",
      workspace,
      session: allowedSession(workspace),
    });

    expect(result).toMatchObject({
      state: "partial-failure",
      failedStep: "绑定采购需求关系",
    });
    expect(workspace.getObject("plan-new")).toBeDefined();
  });

  it("does not write when the member lacks edit permission", async () => {
    const workspace = fixtureWorkspace();
    const sink = createSink();
    workspace.setWriteSink(sink);
    const session = new SessionStore(
      workspace,
      new ChangeSetStore(cloneDemoSeed(), workspace),
    );
    session.switchMember("chenmo");

    const result = await bindBuildPlanRequirement({
      planId: "plan-new",
      requirementId: "requirement-1",
      workspace,
      session,
    });

    expect(result.state).toBe("permission-denied");
    expect(sink.createRelation).not.toHaveBeenCalled();
  });

  it("registers the namespaced action only for the PC build plan", () => {
    const registry = new DataSourceCreateActionRegistry();
    registerPcProcurementSourceActions(registry);
    expect(registry.resolve("pc_procurement", "build_plan")).toBeDefined();
    expect(registry.resolve("hardware_products", "build_plan")).toBeNull();
    expect(pcProcurementBuildPlanCreateActionId).toBe(
      "pc_procurement.build-plan-create",
    );
  });

  it("keeps source action registration idempotent and rejects collisions", () => {
    const registry = new DataSourceCreateActionRegistry();
    registerPcProcurementSourceActions(registry);
    expect(() => registerPcProcurementSourceActions(registry)).not.toThrow();
    expect(() =>
      registry.register(
        pcProcurementBuildPlanCreateActionId,
        "pc_procurement",
        "build_plan",
        () => null,
      ),
    ).toThrow(/不能覆盖/);
  });
});

function fixtureWorkspace(): WorkspaceStore {
  const seed = cloneDemoSeed();
  return new WorkspaceStore({
    ...seed,
    permissions: {
      ...seed.permissions,
      wangyun: { ...seed.permissions.wangyun, build_plan: "edit" },
    },
    objects: [
      object("plan-new", "build_plan", {
        code: "PLAN-NEW",
        name: "新方案",
        status: "DRAFT",
      }),
      object("requirement-1", "procurement_requirement", {
        code: "REQ-001",
        name: "工作站需求",
        budget_cny: 12000,
      }),
      object(
        "requirement-archived",
        "procurement_requirement",
        {
          code: "REQ-OLD",
          name: "已归档需求",
        },
        "archived",
      ),
    ],
  });
}

function allowedSession(workspace: WorkspaceStore): SessionStore {
  return new SessionStore(
    workspace,
    new ChangeSetStore(cloneDemoSeed(), workspace),
  );
}

function createSink(): WriteSink {
  return {
    updateField: vi.fn(),
    createObject: vi.fn(),
    createRelation: vi.fn(),
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
