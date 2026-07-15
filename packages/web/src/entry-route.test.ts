import { describe, expect, it } from "vitest";

import { isUnisourceLocation, rootUnisourceLocation } from "./entry-route";

describe("web entry route", () => {
  it("redirects root to UniSource without losing query or hash", () => {
    expect(
      rootUnisourceLocation("/", "?backend=1&ws=workspace-1", "#document"),
    ).toBe("/us/home?backend=1&ws=workspace-1#document");
  });

  it("keeps UniSource paths and legacy paths distinguishable", () => {
    expect(isUnisourceLocation("/us")).toBe(true);
    expect(isUnisourceLocation("/us/home")).toBe(true);
    expect(isUnisourceLocation("/legacy")).toBe(false);
    expect(rootUnisourceLocation("/us/home", "", "")).toBeNull();
  });
});
