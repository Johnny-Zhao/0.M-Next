import { beforeEach, describe, expect, it } from "vitest";

import {
  fieldDimension,
  groupByDimension,
  listDimensions,
  registerDimension,
  resetDimensions,
  unregisterDimension,
} from "./dimensions";

describe("dimension naming convention", () => {
  beforeEach(() => resetDimensions());

  it("lists built-in dimensions by default", () => {
    expect(listDimensions().map((dimension) => dimension.id)).toEqual([
      "energy",
      "thermal",
      "mass",
    ]);
  });

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

  it("registers and unregisters plugin dimensions", () => {
    registerDimension({
      id: "light",
      label: "光",
      description: "采光和照度字段",
      match: (code) => /^light[_-]/i.test(code),
    });

    expect(listDimensions().map((dimension) => dimension.id)).toContain(
      "light",
    );
    expect(fieldDimension("light_df")).toBe("light");

    unregisterDimension("light");

    expect(listDimensions().map((dimension) => dimension.id)).not.toContain(
      "light",
    );
    expect(fieldDimension("light_df")).toBeNull();
    expect(fieldDimension("energy_soc")).toBe("energy");
  });

  it("overwrites duplicate registrations without duplicating entries", () => {
    registerDimension({
      id: "light",
      label: "光",
      description: "采光字段",
      match: (code) => code === "light_old",
    });
    registerDimension({
      id: "light",
      label: "光照",
      description: "照度字段",
      match: (code) => code === "light_new",
    });

    expect(
      listDimensions().filter((dimension) => dimension.id === "light"),
    ).toHaveLength(1);
    expect(fieldDimension("light_old")).toBeNull();
    expect(fieldDimension("light_new")).toBe("light");
  });

  it("groups fields with the current registered dimension set", () => {
    registerDimension({
      id: "wind",
      label: "风",
      description: "通风字段",
      match: (code) => /^wind[_-]/i.test(code),
    });

    const grouped = groupByDimension({
      energy_soc: 83,
      wind_ach: 1.2,
      owner: "AOCS",
    });

    expect(grouped.energy.map((field) => field.code)).toEqual(["energy_soc"]);
    expect(grouped.wind.map((field) => field.code)).toEqual(["wind_ach"]);

    unregisterDimension("wind");
    expect(groupByDimension({ wind_ach: 1.2 }).wind).toBeUndefined();
  });
});
