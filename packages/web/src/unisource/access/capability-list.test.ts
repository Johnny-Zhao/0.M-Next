import { describe, expect, it } from "vitest";

import { deriveCapabilities } from "./capability-list";

describe("deriveCapabilities", () => {
  it("derives capabilities for admin/edit/readonly/none", () => {
    expect(deriveCapabilities("admin").map((item) => item.allowed)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(deriveCapabilities("edit").map((item) => item.allowed)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(deriveCapabilities("readonly").map((item) => item.allowed)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(deriveCapabilities("none").map((item) => item.allowed)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
