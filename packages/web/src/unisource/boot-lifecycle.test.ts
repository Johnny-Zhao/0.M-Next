import { describe, expect, it, vi } from "vitest";

import { renderWorkspaceBeforeKernelHydration } from "./boot-lifecycle";

describe("renderWorkspaceBeforeKernelHydration", () => {
  it("renders the workspace before waiting for persisted validation", async () => {
    const order: string[] = [];
    let releaseHydration!: () => void;
    const hydration = new Promise<void>((resolve) => {
      releaseHydration = resolve;
    });

    await renderWorkspaceBeforeKernelHydration(
      async () => {
        order.push("load");
      },
      () => order.push("render"),
      async () => {
        order.push("hydrate");
        await hydration;
      },
    );

    expect(order).toEqual(["load", "render", "hydrate"]);
    releaseHydration();
  });

  it("absorbs an unexpected background hydration rejection", async () => {
    const hydrate = vi.fn(() =>
      Promise.reject(new Error("history unavailable")),
    );

    await renderWorkspaceBeforeKernelHydration(
      async () => undefined,
      () => undefined,
      hydrate,
    );
    await Promise.resolve();

    expect(hydrate).toHaveBeenCalledOnce();
  });
});
