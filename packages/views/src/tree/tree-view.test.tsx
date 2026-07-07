import { describe, expect, it, vi } from "vitest";

import { SelectionCoordinator } from "../selection/selection-coordinator";
import {
  buildFlatTree,
  buildTree,
  selectTreeNode,
  supportsTreeRelation,
  treeEmptyMessage,
} from "./tree-view";

describe("TreeView", () => {
  it("builds hierarchy and truncates beyond depth five", () => {
    const tree = buildTree("root", [
      { sourceId: "root", targetId: "one", depth: 1 },
      { sourceId: "one", targetId: "two", depth: 2 },
      { sourceId: "two", targetId: "hidden", depth: 6 },
    ]);

    expect(tree.children[0]?.id).toBe("one");
    expect(tree.children[0]?.children[0]?.id).toBe("two");
    expect(tree.children[0]?.children[0]?.children).toEqual([]);
  });

  it("selection stays in memory without writes", () => {
    const selection = new SelectionCoordinator();
    const writeRequest = vi.fn();
    selectTreeNode(selection, "node");

    expect(selection.current()?.entityId).toBe("node");
    expect(writeRequest).not.toHaveBeenCalled();
  });

  it("only allows known hierarchical relation codes to call tree reads", () => {
    expect(supportsTreeRelation("decomposes_to")).toBe(true);
    expect(supportsTreeRelation("contains")).toBe(true);
    expect(supportsTreeRelation("proposal_contains_system")).toBe(true);
    expect(supportsTreeRelation("adjacent")).toBe(false);
  });

  it("explains unsupported tree states", () => {
    expect(treeEmptyMessage("", "decomposes_to")).toContain("根对象");
    expect(treeEmptyMessage("root", "adjacent")).toBe("该关系不支持树视图。");
  });

  it("builds a flat fallback tree from object names", () => {
    expect(
      buildFlatTree([
        {
          objectId: "room-a",
          objectType: "room",
          status: "ACTIVE",
          version: 1,
          fields: { name: "客厅" },
          updatedAt: "2026-06-21T00:00:00Z",
          source: null,
          ruleStatus: "OK",
        },
      ])[0],
    ).toMatchObject({ id: "room-a", label: "客厅", depth: 0 });
  });

  it("never uses raw UUIDs as fallback tree labels", () => {
    expect(
      buildFlatTree([
        {
          objectId: "a0000000-0000-4000-8000-000000000000",
          objectType: "module",
          status: "ACTIVE",
          version: 1,
          fields: {},
          updatedAt: "2026-07-07T00:00:00Z",
          source: null,
          ruleStatus: "OK",
        },
      ])[0]?.label,
    ).toBe("模块 a00000");
  });
});
