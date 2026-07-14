import { describe, expect, it } from "vitest";

import { PresentationPresetRegistry } from "./presentation-preset-registry";

describe("PresentationPresetRegistry", () => {
  const registry = new PresentationPresetRegistry();

  it("selects hardware, pc procurement and unknown presets", () => {
    expect(registry.resolve("hardware_products").code).toBe(
      "hardware_products",
    );
    expect(registry.resolve("pc_procurement").code).toBe("pc_procurement");
    expect(registry.resolve("not_registered").code).toBe("unknown");
    expect(registry.resolve(null).code).toBe("unknown");
  });

  it("keeps the hardware demo and pc procurement presentation isolated", () => {
    const hardware = registry.resolve("hardware_products");
    const procurement = registry.resolve("pc_procurement");
    const hardwareText = JSON.stringify(hardware);
    const procurementText = JSON.stringify(procurement);

    expect(hardwareText).toMatch(/智能门锁 S3|渠道经营看板/);
    expect(procurementText).toMatch(/电脑采购总览|装机方案对比/);
    expect(procurementText).not.toMatch(/智能门锁|渠道经营看板|prod-s3|S3/);
    expect(hardwareText).not.toMatch(/PLAN-PC-VALID|电脑采购总览/);
  });

  it("returns an independent copy for each workspace load", () => {
    const first = registry.resolve("pc_procurement");
    const second = registry.resolve("pc_procurement");

    expect(first).not.toBe(second);
    expect(first.expressions).not.toBe(second.expressions);
  });
});
