import { describe, expect, it } from "vitest";

import type { FieldDef } from "../model/kernel";
import { canEditGridField } from "./data-grid";

describe("DataGrid edit boundary", () => {
  const stored: FieldDef = { code: "name", name: "Name", dataType: "text" };
  const derived: FieldDef = {
    code: "total_fx",
    name: "Total",
    dataType: "number",
    computed: true,
    readOnly: true,
  };

  it("keeps stored fields editable and computed fields read-only", () => {
    expect(canEditGridField(stored)).toBe(true);
    expect(canEditGridField(derived)).toBe(false);
    expect(canEditGridField(stored, true)).toBe(false);
  });
});
