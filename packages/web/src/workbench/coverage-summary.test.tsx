import { describe, expect, it, vi } from "vitest";

import type { RelationSummary, ViewObject } from "@m-next/views";

import {
  collectRequirementCoverage,
  summarizeRequirementCoverage,
} from "./coverage-summary";

describe("requirement coverage summary", () => {
  it("counts covered and uncovered requirements from satisfies relations", () => {
    const summary = summarizeRequirementCoverage(
      [requirement("req-1"), requirement("req-2"), requirement("req-3")],
      [
        relation("rel-1", "module-1", "req-1"),
        relation("rel-2", "module-2", "req-1"),
        relation("rel-3", "module-1", "req-3"),
        relation("rel-x", "module-1", "other", "proposal_depends_on"),
      ],
    );

    expect(summary).toMatchObject({
      total: 3,
      covered: 2,
      uncovered: 1,
      coverageRate: 67,
    });
    expect(
      summary.uncoveredItems.map((item) => item.requirement.objectId),
    ).toEqual(["req-2"]);
  });

  it("reads module scoped relation ranges instead of a workspace-wide graph", async () => {
    const objects = vi
      .fn()
      .mockResolvedValueOnce({
        items: [object("module-1", "module"), object("module-2", "module")],
        page: 0,
        pageSize: 200,
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [requirement("req-1"), requirement("req-2")],
        page: 0,
        pageSize: 200,
        total: 2,
      });
    const relations = vi
      .fn()
      .mockResolvedValueOnce([relation("rel-1", "module-1", "req-1")])
      .mockResolvedValueOnce([]);

    const summary = await collectRequirementCoverage({
      viewClient: { objects, relations },
      workspaceId: "ws",
    });

    expect(objects).toHaveBeenCalledWith("ws", "module", 0, 200);
    expect(objects).toHaveBeenCalledWith("ws", "requirement", 0, 200);
    expect(relations).toHaveBeenCalledWith(
      "ws",
      "proposal_satisfies",
      "out",
      "module-1",
      1,
    );
    expect(relations).toHaveBeenCalledWith(
      "ws",
      "proposal_satisfies",
      "out",
      "module-2",
      1,
    );
    expect(
      summary.uncoveredItems.map((item) => item.requirement.objectId),
    ).toEqual(["req-2"]);
  });
});

function relation(
  relationId: string,
  sourceId: string,
  targetId: string,
  relationType = "proposal_satisfies",
): RelationSummary {
  return { relationId, relationType, sourceId, targetId, version: 1 };
}

function requirement(objectId: string): ViewObject {
  return object(objectId, "requirement");
}

function object(objectId: string, objectType: string): ViewObject {
  return {
    objectId,
    objectType,
    status: "ACTIVE",
    version: 1,
    fields: { code: objectId, name: objectId },
    updatedAt: "2026-07-09T00:00:00Z",
    source: null,
    ruleStatus: "OK",
  };
}
