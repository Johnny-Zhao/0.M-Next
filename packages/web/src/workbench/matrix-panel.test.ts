import { describe, expect, it } from "vitest";

import type { ObjectType } from "@m-next/views";

import { inferMatrixConfig, relationOptionsForTypes } from "./matrix-panel";

const objectType = (code: string, name = code): ObjectType => ({
  id: code,
  code,
  name,
  fields: [],
});

describe("MatrixPanel configuration", () => {
  it("defaults interior workspaces to room adjacency", () => {
    expect(
      inferMatrixConfig(
        [objectType("floorplan"), objectType("room")],
        "room",
        "adjacent",
      ),
    ).toEqual({
      rowType: "room",
      colType: "room",
      relationType: "adjacent",
    });
  });

  it("defaults technical proposal workspaces to module requirement coverage", () => {
    expect(
      inferMatrixConfig(
        [
          objectType("proposal"),
          objectType("system"),
          objectType("module"),
          objectType("requirement"),
        ],
        "room",
        "adjacent",
      ),
    ).toEqual({
      rowType: "module",
      colType: "requirement",
      relationType: "proposal_satisfies",
    });
  });

  it("filters known relation options by available object types", () => {
    expect(
      relationOptionsForTypes([objectType("module"), objectType("interface")]),
    ).toContainEqual({
      code: "proposal_interfaces_with",
      label: "Interfaces With",
      rowType: "module",
      colType: "interface",
    });
  });
});
