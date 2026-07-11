import { describe, expect, it, vi } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { SelectionStore } from "./selection-store";
import { WorkspaceStore } from "./workspace-store";

describe("SelectionStore", () => {
  it("keeps selection changes isolated from workspace data", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const selection = new SelectionStore();
    const listener = vi.fn();
    selection.subscribe(listener);
    const before = workspace.getSnapshot();
    const beforeEvents = workspace.getChangeEvents().length;

    selection.set({ entityType: "object", entityId: "prod-s3" });
    selection.add({
      entityType: "field",
      entityId: "prod-s3",
      fieldCode: "price",
    });
    selection.toggle({
      entityType: "relation",
      entityId: "rel-s3-g2-interconnect",
    });
    selection.clear();

    expect(workspace.getSnapshot()).toBe(before);
    expect(workspace.getChangeEvents()).toHaveLength(beforeEvents);
    expect(selection.getSnapshot()).toEqual({ current: null, selected: [] });
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
