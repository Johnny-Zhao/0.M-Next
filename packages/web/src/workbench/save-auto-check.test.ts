import { describe, expect, it, vi } from "vitest";

import { runSaveAutoCheck } from "./save-auto-check";

describe("runSaveAutoCheck", () => {
  it("refreshes once before checking and again after results arrive", async () => {
    const runRuleCheck = vi.fn().mockResolvedValue("run-1");
    const refreshViews = vi.fn();

    await runSaveAutoCheck({
      actorId: "actor-1",
      workspaceId: "workspace-1",
      viewClient: { runRuleCheck },
      refreshViews,
    });

    expect(runRuleCheck).toHaveBeenCalledWith("workspace-1", "actor-1", null);
    expect(refreshViews).toHaveBeenCalledTimes(2);
    expect(refreshViews.mock.invocationCallOrder[0]).toBeLessThan(
      runRuleCheck.mock.invocationCallOrder[0] ?? 0,
    );
    expect(runRuleCheck.mock.invocationCallOrder[0]).toBeLessThan(
      refreshViews.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it("swallows rule check failures after the immediate refresh", async () => {
    const runRuleCheck = vi.fn().mockRejectedValue(new Error("rules offline"));
    const refreshViews = vi.fn();

    await expect(
      runSaveAutoCheck({
        actorId: "actor-1",
        workspaceId: "workspace-1",
        viewClient: { runRuleCheck },
        refreshViews,
      }),
    ).resolves.toBeUndefined();

    expect(refreshViews).toHaveBeenCalledTimes(1);
  });
});
