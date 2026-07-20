import { describe, expect, it } from "vitest";

import { workspaceLaunchLocation } from "./workspace-launcher";

describe("workspace launcher", () => {
  it("opens a selected workspace through the backend boot route", () => {
    expect(workspaceLaunchLocation("ws-pc procurement")).toBe(
      "/us/home?backend=1&ws=ws-pc+procurement",
    );
  });
});
