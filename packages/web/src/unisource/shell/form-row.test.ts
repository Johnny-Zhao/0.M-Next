import { describe, expect, it } from "vitest";

import { formLabel, nextFormSearch } from "./form-row";

describe("FormRow helpers", () => {
  it("round-trips the form search parameter while preserving others", () => {
    expect(nextFormSearch("", "doc")).toBe("?form=doc");
    expect(nextFormSearch("form=grid&drawer=chat", "canvas")).toBe(
      "?form=canvas&drawer=chat",
    );
  });

  it("labels built-in forms as mono tags", () => {
    expect(formLabel("grid")).toBe("GRID");
    expect(formLabel("doc")).toBe("DOC");
    expect(formLabel("plugin:retail:forecast")).toBe("PLUGIN:RETAIL:FORECAST");
  });
});
