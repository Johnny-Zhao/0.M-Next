import { describe, expect, it } from "vitest";

import { coerceFieldValue } from "./field-coerce";

describe("coerceFieldValue", () => {
  it("converts number fields by their declared dataType", () => {
    expect(coerceFieldValue("240", "number", null)).toEqual({
      ok: true,
      value: 240,
    });
    expect(coerceFieldValue("12.5", "number", undefined)).toEqual({
      ok: true,
      value: 12.5,
    });
  });

  it("blocks non-finite numbers with a readable message", () => {
    expect(coerceFieldValue("abc", "number", null)).toEqual({
      ok: false,
      message: "请输入数字",
    });
  });

  it("falls back to the current value type when the definition is missing", () => {
    expect(coerceFieldValue("50", undefined, 10)).toEqual({
      ok: true,
      value: 50,
    });
    expect(coerceFieldValue("hello", undefined, "world")).toEqual({
      ok: true,
      value: "hello",
    });
  });

  it("coerces boolean fields and passes strings through otherwise", () => {
    expect(coerceFieldValue("true", "boolean", false)).toEqual({
      ok: true,
      value: true,
    });
    expect(coerceFieldValue("notes", "string", "old")).toEqual({
      ok: true,
      value: "notes",
    });
  });
});
