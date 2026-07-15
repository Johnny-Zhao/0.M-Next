import { describe, expect, it } from "vitest";

import type { ViewDef } from "../model/kernel";
import { PresentationPresetRegistry } from "./presentation-preset-registry";
import { resolveExpressionView } from "./expression-runtime";

describe("expression runtime", () => {
  const registry = new PresentationPresetRegistry();

  it.each([
    ["hardware_products", "exp-dashboard", "bi", "view-dashboard-bi"],
    ["hardware_products", "exp-dashboard", "grid", "view-dashboard-grid"],
    ["pc_procurement", "exp-pc-overview", "grid", "view-pc-grid"],
    ["pc_procurement", "exp-pc-document", "doc", "view-pc-doc"],
  ] as const)(
    "resolves %s views from expression config",
    (profile, id, form, viewId) => {
      const preset = registry.resolve(profile);
      const result = resolveExpressionView(preset, id, form);

      expect(result.state).toBe("ready");
      expect(result.view?.id).toBe(viewId);
    },
  );

  it("uses defaultViewId instead of view array order", () => {
    const preset = registry.resolve("hardware_products");
    const expression = preset.expressions.find(
      (candidate) => candidate.id === "exp-dashboard",
    )!;
    const result = resolveExpressionView(
      { ...preset, views: [...preset.views].reverse() },
      expression.id,
      expression.defaultForm,
    );

    expect(result.view?.id).toBe(expression.defaultViewId);
  });

  it("returns safe states for missing and mismatched views", () => {
    const preset = registry.resolve("pc_procurement");
    const missing = resolveExpressionView(
      { ...preset, views: [] },
      "exp-pc-document",
      "doc",
    );
    const wrongView: ViewDef = {
      id: "view-pc-doc",
      exprId: "exp-pc-document",
      kind: "canvas",
      config: {},
    };
    const mismatch = resolveExpressionView(
      { ...preset, views: [wrongView] },
      "exp-pc-document",
      "doc",
    );

    expect(missing.state).toBe("viewMissing");
    expect(mismatch.state).toBe("kindMismatch");
    expect(mismatch.message).toContain("不匹配");
  });

  it("opens the unknown preset without business assumptions", () => {
    const preset = registry.resolve("future_profile");
    const result = resolveExpressionView(preset, "exp-generic-data", "grid");

    expect(result.state).toBe("ready");
    expect(JSON.stringify(result)).not.toMatch(/门锁|电脑采购|渠道/);
  });
});
