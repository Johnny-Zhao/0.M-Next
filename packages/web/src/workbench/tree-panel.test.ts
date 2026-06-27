import { describe, expect, it } from "vitest";

import { defaultTreeRelationType, firstTreeRoot } from "./tree-panel";

describe("tree-panel", () => {
  it("uses contains as the default hierarchical relation", () => {
    expect(defaultTreeRelationType).toBe("contains");
  });

  it("selects the first floorplan object as auto root", () => {
    expect(
      firstTreeRoot([
        {
          objectId: "floorplan-a",
          objectType: "floorplan",
          status: "ACTIVE",
          version: 1,
          fields: { name: "A1" },
          updatedAt: "2026-06-21T00:00:00Z",
          source: null,
          ruleStatus: "OK",
        },
      ]),
    ).toBe("floorplan-a");
    expect(firstTreeRoot([])).toBeNull();
  });
});
