import { describe, expect, it } from "vitest";

import { App } from "./app";

describe("App", () => {
  it("creates the application shell", () => {
    expect(App().type).toBe("main");
  });
});
