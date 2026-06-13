import { describe, expect, it, vi } from "vitest";

import { SelectionCoordinator } from "./selection-coordinator";

describe("SelectionCoordinator", () => {
  it("publishes in memory and clears when workspace changes", () => {
    const coordinator = new SelectionCoordinator();
    const listener = vi.fn();
    const writeRequest = vi.fn();
    coordinator.subscribe(listener);
    coordinator.switchWorkspace("one");

    coordinator.select({
      entityType: "field",
      entityId: "object",
      fieldCode: "cost",
    });
    expect(coordinator.current()?.fieldCode).toBe("cost");
    expect(writeRequest).not.toHaveBeenCalled();

    coordinator.switchWorkspace("two");
    expect(coordinator.current()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null);
  });
});
