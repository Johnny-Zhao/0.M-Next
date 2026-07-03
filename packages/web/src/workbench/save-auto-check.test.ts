import { describe, expect, it, vi } from "vitest";

import { runSaveAutoCheck } from "./save-auto-check";

describe("runSaveAutoCheck", () => {
  it("runs a workspace-wide rule check and refreshes after it completes", async () => {
    const runRuleCheck = vi.fn().mockResolvedValue("run-1");
    const refreshViews = vi.fn();

    await runSaveAutoCheck({
      actorId: "actor-1",
      workspaceId: "workspace-1",
      viewClient: { runRuleCheck },
      refreshViews,
    });

    expect(runRuleCheck).toHaveBeenCalledWith("workspace-1", "actor-1", null);
    expect(refreshViews).toHaveBeenCalledTimes(1);
    expect(runRuleCheck.mock.invocationCallOrder[0]).toBeLessThan(
      refreshViews.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("swallows rule check failures without refreshing or reporting", async () => {
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

    expect(refreshViews).not.toHaveBeenCalled();
  });
});
