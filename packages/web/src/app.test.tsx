import { describe, expect, it } from "vitest";

import { App, syncLabel } from "./app";

describe("App", () => {
  it("creates the application shell", () => {
    expect(typeof App).toBe("function");
    expect(syncLabel({ pendingEvents: 0, caughtUp: true })).toContain("绿");
    expect(syncLabel({ pendingEvents: 3, caughtUp: false })).toContain("黄");
    expect(syncLabel("error")).toContain("红");
  });
});
