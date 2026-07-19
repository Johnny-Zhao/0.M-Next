import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveKernelValidationScope } from "./kernel-validation-scope";

const workspace = {
  objects: [
    object("plan", "build_plan", "方案 A"),
    object("item", "build_plan_item", "明细 A"),
    object("product", "hardware_product", "产品 A"),
  ],
  relations: [
    relation("contains", "build_plan_contains_item", "plan", "item"),
    relation("selects", "build_plan_item_selects_product", "item", "product"),
  ],
  views: [
    {
      id: "canvas",
      exprId: "expr",
      kind: "canvas" as const,
      config: {
        selectionObjectTypeCode: "build_plan",
        selectionRelationTypeCodes: [
          "build_plan_contains_item",
          "build_plan_item_selects_product",
        ],
        selectionDepth: 2,
      },
    },
  ],
};

const config = {
  objectTypeCode: null,
  position: "bottom" as const,
  allowManualRun: true,
  scopeCanvasViewId: "canvas",
};

describe("resolveKernelValidationScope", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves a selected descendant through the configured canvas relations", () => {
    const scope = resolveKernelValidationScope(workspace, config, {
      entityType: "object",
      entityId: "product",
    });

    expect(scope?.rootObjectId).toBe("plan");
    expect(scope?.label).toBe("方案 A");
    expect(Array.from(scope?.members ?? [])).toEqual([
      "plan",
      "item",
      "product",
    ]);
  });

  it("uses the bound root and leaves unrelated selections unscoped", () => {
    expect(
      resolveKernelValidationScope(workspace, config, null, "plan")
        ?.rootObjectId,
    ).toBe("plan");
    expect(
      resolveKernelValidationScope(workspace, config, {
        entityType: "relation",
        entityId: "contains",
      })?.rootObjectId,
    ).toBe("plan");
    expect(
      resolveKernelValidationScope(workspace, config, {
        entityType: "object",
        entityId: "missing",
      }),
    ).toBeNull();
  });

  it("resolves the display scope without a fetch or write request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    resolveKernelValidationScope(workspace, config, {
      entityType: "object",
      entityId: "item",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function object(id: string, objectTypeCode: string, name: string) {
  return {
    id,
    objectTypeCode,
    status: "active" as const,
    version: 1,
    fields: { name: field(name) },
    createdBy: "wangyun" as const,
    createdAt: "2026-07-18T00:00:00Z",
    updatedBy: "wangyun" as const,
    updatedAt: "2026-07-18T00:00:00Z",
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

function field(value: string) {
  return {
    value,
    fieldVersion: 1,
    updatedBy: "wangyun" as const,
    updatedAt: "2026-07-18T00:00:00Z",
    source: "manual" as const,
  };
}
