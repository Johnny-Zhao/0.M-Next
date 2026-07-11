import { describe, expect, it } from "vitest";

import { cloneDemoSeed, productType } from "../seed/demo-seed";
import { buildGridViewModel } from "./grid-view-model";

describe("buildGridViewModel", () => {
  it("derives columns, rows and the price average", () => {
    const seed = cloneDemoSeed();
    const products = seed.objects.filter(
      (object) => object.objectTypeCode === "product_specs",
    );

    const vm = buildGridViewModel({
      objectType: productType,
      objects: products,
      selectedIds: new Set(["prod-s3"]),
      fieldRefs: seed.fieldRefs,
    });

    expect(vm.columns.map((column) => column.typeMark)).toContain("#");
    expect(vm.columns.map((column) => column.code)).toContain("owner");
    expect(vm.rows).toHaveLength(8);
    expect(vm.rows[0]?.selected).toBe(true);
    expect(vm.rows[0]?.statusTone).toBe("presale");
    expect(vm.status.averageLabel).toContain("¥547");
  });

  it("filters停产 records and searches by product name", () => {
    const seed = cloneDemoSeed();
    const products = seed.objects.filter(
      (object) => object.objectTypeCode === "product_specs",
    );

    const hidden = buildGridViewModel({
      objectType: productType,
      objects: products,
      hideEol: true,
    });
    const searched = buildGridViewModel({
      objectType: productType,
      objects: products,
      search: "门锁",
    });

    expect(hidden.rows.map((row) => row.objectId)).not.toContain("prod-p1");
    expect(searched.rows.map((row) => row.objectId)).toEqual([
      "prod-s3",
      "prod-s3-lite",
    ]);
  });

  it("masks values for data sources without read permission", () => {
    const seed = cloneDemoSeed();
    const customerType = seed.objectTypes.find(
      (type) => type.code === "customers",
    )!;
    const customers = seed.objects.filter(
      (object) => object.objectTypeCode === "customers",
    );

    const masked = buildGridViewModel({
      objectType: customerType,
      objects: customers,
      maskValues: true,
    });
    const visible = buildGridViewModel({
      objectType: customerType,
      objects: customers,
      maskValues: false,
    });

    expect(masked.rows[0]?.cells.map((cell) => cell.text)).toEqual([
      "···",
      "···",
    ]);
    expect(masked.rows[0]?.cells.every((cell) => cell.masked)).toBe(true);
    expect(visible.rows[0]?.cells[0]?.text).toBe("华东智联");
  });
});
