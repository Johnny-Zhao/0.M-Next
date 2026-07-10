import { describe, expect, it, vi } from "vitest";

import type { ObjectType } from "@m-next/views";

import {
  createAutoCheckingMatrixCommandClient,
  inferMatrixConfig,
  relationOptionsForTypes,
} from "./matrix-panel";

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

  it("refreshes and revalidates after creating a coverage relation", async () => {
    const createRelation = vi.fn().mockResolvedValue({ relationId: "rel-1" });
    const unlink = vi.fn().mockResolvedValue(undefined);
    const runRuleCheck = vi.fn().mockResolvedValue("run-1");
    const refreshViews = vi.fn();
    const client = createAutoCheckingMatrixCommandClient({
      commandClient: { createRelation, unlink },
      actorId: "actor-1",
      workspaceId: "ws",
      viewClient: { runRuleCheck },
      refreshViews,
    });

    await client.createRelation(
      "ws",
      "proposal_satisfies",
      "module-1",
      "req-1",
    );

    expect(createRelation).toHaveBeenCalledWith(
      "ws",
      "proposal_satisfies",
      "module-1",
      "req-1",
    );
    expect(runRuleCheck).toHaveBeenCalledWith("ws", "actor-1", null);
    expect(refreshViews).toHaveBeenCalledTimes(2);
  });
});
