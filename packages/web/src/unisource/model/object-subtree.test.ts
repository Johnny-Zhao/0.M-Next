import { describe, expect, it } from "vitest";

import {
  resolveUniqueSubtreeRoot,
  traverseObjectSubtree,
} from "./object-subtree";

const workspace = {
  objects: [
    object("plan", "plan"),
    object("item", "item"),
    object("product", "product"),
    { ...object("archived", "product"), status: "archived" as const },
  ],
  relations: [
    relation("contains", "contains", "plan", "item"),
    relation("selects", "selects", "item", "product"),
    relation("archived-target", "selects", "item", "archived"),
  ],
};

describe("object subtree", () => {
  it("traverses configured active relations with bounded depth", () => {
    expect(
      Array.from(
        traverseObjectSubtree(workspace, "plan", ["contains", "selects"], 2)!
          .objectIds,
      ),
    ).toEqual(["plan", "item", "product"]);
    expect(
      Array.from(
        traverseObjectSubtree(workspace, "plan", ["contains", "selects"], 1)!
          .relationIds,
      ),
    ).toEqual(["contains"]);
  });

  it("excludes terminal descendants and only resolves unique roots", () => {
    expect(
      resolveUniqueSubtreeRoot(
        workspace,
        "product",
        "plan",
        ["contains", "selects"],
        2,
      ),
    ).toBe("plan");
    expect(
      traverseObjectSubtree(workspace, "archived", ["selects"], 1),
    ).toBeNull();
  });
});

function object(id: string, objectTypeCode: string) {
  return {
    id,
    objectTypeCode,
    status: "active" as const,
    version: 1,
    fields: {},
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
