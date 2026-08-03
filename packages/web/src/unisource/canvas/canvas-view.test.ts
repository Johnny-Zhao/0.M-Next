import { describe, expect, it } from "vitest";

import { canvasSelectionProps } from "./canvas-view";
import { canvasSelectionObjectId } from "./canvas-root-selection";

describe("CanvasView", () => {
  it("keeps ReactFlow selection disabled for the externally controlled nodes", () => {
    expect(canvasSelectionProps.elementsSelectable).toBe(false);
    expect("onSelectionChange" in canvasSelectionProps).toBe(false);
  });

  it("uses a field selection's owning object for canvas linkage", () => {
    expect(
      canvasSelectionObjectId({
        entityType: "field",
        entityId: "plan-std",
        fieldCode: "total_price_cny_fx",
      }),
    ).toBe("plan-std");
    expect(
      canvasSelectionObjectId({
        entityType: "object",
        entityId: "plan-std",
      }),
    ).toBe("plan-std");
    expect(
      canvasSelectionObjectId({
        entityType: "relation",
        entityId: "contains-std-item",
      }),
    ).toBeNull();
    expect(canvasSelectionObjectId(null)).toBeNull();
  });
});
