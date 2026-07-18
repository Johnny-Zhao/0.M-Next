import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { selectedCanvasPanelNodes } from "./inspector-props-panel";

describe("CanvasPropsPanel", () => {
  it("lists a selected object from the active derived canvas root", () => {
    const workspace = new WorkspaceStore({
      ...cloneDemoSeed(),
      objectTypes: [
        type("build_plan", "方案"),
        type("build_plan_item", "明细"),
      ],
      objects: [
        object("plan", "build_plan", "方案 A"),
        object("item", "build_plan_item", "明细 A"),
      ],
      relations: [relation("plan", "item")],
    }).getSnapshot();
    const view = {
      id: "pc-canvas",
      exprId: "pc",
      kind: "canvas" as const,
      config: {
        selectionObjectTypeCode: "build_plan",
        selectionRelationTypeCodes: ["build_plan_contains_item"],
      },
    };

    expect(
      selectedCanvasPanelNodes(workspace, view, "plan", new Set(["item"])),
    ).toMatchObject([{ objectId: "item", name: "明细 A" }]);
  });
});

function type(code: string, name: string) {
  return {
    code,
    name,
    group: "采购",
    fields: [
      { code: "code", name: "编码", dataType: "text" as const },
      { code: "name", name: "名称", dataType: "text" as const },
    ],
  };
}

function object(id: string, objectTypeCode: string, name: string) {
  return {
    id,
    objectTypeCode,
    status: "active" as const,
    version: 1,
    fields: {
      code: value(id),
      name: value(name),
    },
    createdBy: "wangyun" as const,
    createdAt: "2026-07-17T00:00:00Z",
    updatedBy: "wangyun" as const,
    updatedAt: "2026-07-17T00:00:00Z",
  };
}

function relation(sourceId: string, targetId: string) {
  return {
    id: "contains",
    relationTypeCode: "build_plan_contains_item",
    sourceId,
    targetId,
    status: "active" as const,
    fields: {},
    version: 1,
    annotationIds: [],
  };
}

function value(text: string) {
  return {
    value: text,
    fieldVersion: 1,
    updatedBy: "wangyun" as const,
    updatedAt: "2026-07-17T00:00:00Z",
    source: "manual" as const,
  };
}
