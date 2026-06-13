import { describe, expect, it, vi } from "vitest";

import { SelectionCoordinator } from "../selection/selection-coordinator";
import { buildTree } from "./tree-view";

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
    selection.select({ entityType: "object", entityId: "node" });

    expect(selection.current()?.entityId).toBe("node");
    expect(writeRequest).not.toHaveBeenCalled();
  });
});
