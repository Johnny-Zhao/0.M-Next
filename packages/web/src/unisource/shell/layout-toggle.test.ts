import { describe, expect, it } from "vitest";

import { nextLayoutSearch } from "./layout-toggle";

describe("nextLayoutSearch", () => {
  it("adds and removes split layout without losing form", () => {
    expect(nextLayoutSearch("form=doc", true)).toBe("?form=doc&layout=split");
    expect(nextLayoutSearch("form=doc&layout=split", false)).toBe("?form=doc");
  });
});
