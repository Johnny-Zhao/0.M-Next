import { describe, expect, it } from "vitest";

import { fieldDimension, groupByDimension } from "./dimensions";

describe("dimension naming convention", () => {
  it("matches fields by temporary frontend naming convention", () => {
    expect(fieldDimension("energy_soc")).toBe("energy");
    expect(fieldDimension("batteryPower")).toBe("energy");
    expect(fieldDimension("thermal_temp")).toBe("thermal");
    expect(fieldDimension("散热状态")).toBe("thermal");
    expect(fieldDimension("mass_kg")).toBe("mass");
    expect(fieldDimension("重心X")).toBe("mass");
  });

  it("returns null when a field has no dimension hint", () => {
    expect(fieldDimension("owner")).toBeNull();
    expect(fieldDimension("name")).toBeNull();
  });

  it("groups only recognized fields across multiple dimensions", () => {
    const grouped = groupByDimension({
      energy_soc: 83,
      voltage: 28,
      temperature: "42C",
      payload_weight: "12kg",
      owner: "AOCS",
    });

    expect(grouped.energy.map((field) => field.code)).toEqual([
      "energy_soc",
      "voltage",
    ]);
    expect(grouped.thermal.map((field) => field.code)).toEqual(["temperature"]);
    expect(grouped.mass.map((field) => field.code)).toEqual(["payload_weight"]);
  });
});
