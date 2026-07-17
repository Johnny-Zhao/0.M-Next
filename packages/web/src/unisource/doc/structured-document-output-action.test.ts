import { describe, expect, it } from "vitest";

import {
  outputCheckStatusLabel,
  outputReviewStatusLabel,
} from "./structured-document-output-action";

describe("structured document output status labels", () => {
  it.each([
    ["BLOCK", "有阻断"],
    ["WARN", "有警告"],
    ["OK", "通过"],
    ["UNCHECKED", "未校验"],
    ["UNKNOWN", "未记录"],
  ])("maps check status %s", (status, label) => {
    expect(outputCheckStatusLabel(status)).toBe(label);
  });

  it("maps review status and legacy unknown", () => {
    expect(outputReviewStatusLabel("UNREVIEWED")).toBe("未评审");
    expect(outputReviewStatusLabel("UNKNOWN")).toBe("未记录");
  });
});
