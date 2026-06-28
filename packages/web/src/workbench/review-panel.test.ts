import { describe, expect, it } from "vitest";

import {
  annotationSeverityLabel,
  annotationStatusLabel,
  selectedAnnotationTarget,
} from "./review-panel";

describe("review-panel", () => {
  it("labels annotation severity and status", () => {
    expect(annotationSeverityLabel("issue")).toBe("问题");
    expect(annotationSeverityLabel("suggest")).toBe("建议");
    expect(annotationStatusLabel("open")).toBe("开放");
    expect(annotationStatusLabel("resolved")).toBe("已解决");
  });

  it("derives annotation target from object and field selections", () => {
    expect(
      selectedAnnotationTarget({ entityType: "object", entityId: "obj-1" }),
    ).toEqual({ targetId: "obj-1", fieldCode: null });
    expect(
      selectedAnnotationTarget({
        entityType: "field",
        entityId: "obj-1",
        fieldCode: "name",
      }),
    ).toEqual({ targetId: "obj-1", fieldCode: "name" });
    expect(
      selectedAnnotationTarget({ entityType: "relation", entityId: "rel-1" }),
    ).toBeNull();
  });
});
