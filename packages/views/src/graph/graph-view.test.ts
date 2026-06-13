import { describe, expect, it, vi } from "vitest";

vi.mock("@antv/g6", () => ({
  Graph: vi.fn(),
  NodeEvent: { CLICK: "node:click" },
}));

import { relationsToGraph } from "./graph-view";

describe("GraphView", () => {
  it("maps bounded relations to unique nodes and typed edges", () => {
    const graph = relationsToGraph([
      {
        relationId: "r1",
        relationType: "depends_on",
        sourceId: "a",
        targetId: "b",
      },
      {
        relationId: "r2",
        relationType: "depends_on",
        sourceId: "a",
        targetId: "c",
      },
    ]);

    expect(graph.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0]?.relationType).toBe("depends_on");
  });
});
