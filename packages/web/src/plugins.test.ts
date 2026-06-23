import { beforeEach, describe, expect, it } from "vitest";

import { registerInteriorDesign, unregisterInteriorDesign } from "./plugins";
import {
  fieldDimension,
  listDimensions,
  resetDimensions,
} from "./workbench/dimensions";

describe("installed plugins", () => {
  beforeEach(() => resetDimensions());

  it("registers and unregisters interior design dimensions", () => {
    registerInteriorDesign();

    expect(listDimensions().map((dimension) => dimension.id)).toEqual([
      "energy",
      "thermal",
      "mass",
      "light",
      "wind",
    ]);
    expect(fieldDimension("light_df")).toBe("light");
    expect(fieldDimension("采光系数")).toBe("light");
    expect(fieldDimension("wind_ach")).toBe("wind");
    expect(fieldDimension("换气次数")).toBe("wind");

    unregisterInteriorDesign();

    expect(listDimensions().map((dimension) => dimension.id)).toEqual([
      "energy",
      "thermal",
      "mass",
    ]);
    expect(fieldDimension("light_df")).toBeNull();
    expect(fieldDimension("wind_ach")).toBeNull();
    expect(fieldDimension("energy_soc")).toBe("energy");
  });
});
