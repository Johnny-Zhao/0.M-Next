import { describe, expect, it } from "vitest";

import { StructuredDocumentActionRegistry } from "../doc/structured-document-action-registry";
import { DataSourceCreateActionRegistry } from "./data-source-create-action-registry";
import { pcProcurementItemActionId } from "./pc-procurement-document-actions";
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

  it("registers pc document actions through the presentation composition layer", () => {
    const actions = new StructuredDocumentActionRegistry();
    const isolatedRegistry = new PresentationPresetRegistry(actions);
    isolatedRegistry.resolve("pc_procurement");
    isolatedRegistry.resolve("pc_procurement");

    expect(actions.resolve(pcProcurementItemActionId)).not.toBeNull();
  });

  it("registers the PC build-plan create action only for the PC preset", () => {
    const sourceActions = new DataSourceCreateActionRegistry();
    const isolatedRegistry = new PresentationPresetRegistry(
      new StructuredDocumentActionRegistry(),
      sourceActions,
    );

    isolatedRegistry.resolve("pc_procurement");
    expect(
      sourceActions.resolve("pc_procurement", "build_plan"),
    ).not.toBeNull();
    isolatedRegistry.resolve("future_profile");
    expect(sourceActions.resolve("future_profile", "build_plan")).toBeNull();
  });

  it("does not register pc actions while resolving hardware or unknown presets", () => {
    const actions = new StructuredDocumentActionRegistry();
    const isolatedRegistry = new PresentationPresetRegistry(actions);

    isolatedRegistry.resolve("hardware_products");
    isolatedRegistry.resolve("future_profile");

    expect(actions.resolve(pcProcurementItemActionId)).toBeNull();
  });

  it("keeps hardware presentation unchanged after pc actions are registered", () => {
    const actions = new StructuredDocumentActionRegistry();
    const isolatedRegistry = new PresentationPresetRegistry(actions);
    isolatedRegistry.resolve("pc_procurement");
    const hardware = isolatedRegistry.resolve("hardware_products");

    expect(actions.resolve(pcProcurementItemActionId)).not.toBeNull();
    expect(JSON.stringify(hardware)).not.toContain(pcProcurementItemActionId);
  });

  it("binds the plan map to real procurement item, product and quote data", () => {
    const procurement = registry.resolve("pc_procurement");
    const canvas = procurement.views.find(
      (view) => view.id === "view-pc-canvas",
    )!;

    expect(canvas.config.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ objectId: "pc-ref-valid-cpu-item" }),
        expect.objectContaining({ objectId: "pc-ref-valid-cpu-product" }),
        expect.objectContaining({ objectId: "pc-ref-valid-cpu-quote" }),
      ]),
    );
    expect(procurement.objectBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fields: { code: "ITEM-V-CPU" } }),
        expect.objectContaining({ fields: { code: "HW-CPU-I5-14600K" } }),
        expect.objectContaining({ fields: { code: "Q-CPU-I5" } }),
      ]),
    );
    expect(procurement.relationBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationTypeCode: "build_plan_item_selects_product",
        }),
        expect.objectContaining({
          relationTypeCode: "build_plan_item_uses_supplier_quote",
        }),
      ]),
    );
  });

  it("configures all profiles for the same generic grid runtime", () => {
    const hardware = registry
      .resolve("hardware_products")
      .views.find((view) => view.id === "view-dashboard-grid")!;
    const procurement = registry
      .resolve("pc_procurement")
      .views.find((view) => view.id === "view-pc-grid")!;
    const unknown = registry
      .resolve("future")
      .views.find((view) => view.id === "view-generic-grid")!;

    expect(hardware.config.objectTypeCode).toBe("product_specs");
    expect(procurement.config.objectTypeCode).toBe("build_plan");
    expect(unknown.config.objectTypeCode).toBeUndefined();
    expect(procurement.config.validation).toMatchObject({
      enabled: true,
      objectTypeCode: "build_plan",
      position: "bottom",
    });
    expect(unknown.config.validation).toBeUndefined();
    expect(
      [hardware, procurement, unknown].every((view) => view.kind === "grid"),
    ).toBe(true);
    expect(JSON.stringify(unknown.config)).not.toMatch(/门锁|电脑采购|S3/);
  });
});
