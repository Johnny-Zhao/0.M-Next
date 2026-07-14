import { describe, expect, it } from "vitest";

import { PresentationPresetRegistry } from "../presentation/presentation-preset-registry";
import { cloneDemoSeed } from "../seed/demo-seed";
import { resolveExpressionGridFallback } from "./expression-grid-fallback";

describe("expression grid fallback", () => {
  const registry = new PresentationPresetRegistry();
  const demoType = cloneDemoSeed().objectTypes[0]!;
  it("routes pc procurement grid metadata to its source", () => {
    const preset = registry.resolve("pc_procurement");
    const objectTypes = [{ ...demoType, code: "build_plan" }];

    const source = resolveExpressionGridFallback(
      { objectTypes, views: preset.views },
      "exp-pc-overview",
    );
    expect(source).toBe("build_plan");
  });
  it("routes an unknown profile to the first available source", () => {
    const preset = registry.resolve("future_profile");
    const source = resolveExpressionGridFallback(
      { objectTypes: [demoType], views: preset.views },
      "exp-generic-data",
    );
    expect(source).toBe(demoType.code);
  });
  it("does not alter hardware expressions without fallback metadata", () => {
    const preset = registry.resolve("hardware_products");
    const source = resolveExpressionGridFallback(
      { objectTypes: [demoType], views: preset.views },
      "exp-dashboard",
    );
    expect(source).toBeUndefined();
  });
});
