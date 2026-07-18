import { describe, expect, it } from "vitest";

import { canvasSelectionProps } from "./canvas-view";

describe("CanvasView", () => {
  it("keeps ReactFlow selection disabled for the externally controlled nodes", () => {
    expect(canvasSelectionProps.elementsSelectable).toBe(false);
    expect("onSelectionChange" in canvasSelectionProps).toBe(false);
  });
});
