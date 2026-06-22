import { describe, expect, it, vi } from "vitest";

import type { ViewObject } from "@m-next/views";

import {
  connectDiagramObjects,
  objectsAndRelationsToFlow,
  relationLabel,
  unlinkDiagramEdges,
  type DiagramCommandClient,
  type DiagramEdge,
} from "./diagram-panel";
import { relationEdgeVisual, relationRoute } from "./edges";

describe("diagram relation edges", () => {
  it("creates relations from anchored connections through CommandClient", async () => {
    const commandClient = diagramCommandClient();

    const connected = await connectDiagramObjects(
      commandClient,
      "workspace-1",
      "depends_on",
      {
        source: "obj-a",
        sourceHandle: "source-right",
        target: "obj-b",
        targetHandle: "target-left",
      },
    );

    expect(connected).toBe(true);
    expect(commandClient.createRelation).toHaveBeenCalledWith(
      "workspace-1",
      "depends_on",
      "obj-a",
      "obj-b",
    );
  });

  it("maps relation type to route, label, ports, and visual style", () => {
    const flow = objectsAndRelationsToFlow(
      [
        object("obj-a", "对象A"),
        object("obj-b", "对象B"),
        object("obj-c", "对象C"),
      ],
      [
        relation("rel-1", "depends_on", "obj-a", "obj-b", 2, {
          fields: { name: "供电依赖" },
        }),
        relation("rel-2", "trace_to", "obj-a", "obj-c", 4),
      ],
      null,
    );

    expect(flow.edges[0]?.type).toBe("dataRelation");
    expect(flow.edges[0]?.sourceHandle).toBe("source-right");
    expect(flow.edges[0]?.targetHandle).toBe("target-left");
    expect(flow.edges[0]?.data).toMatchObject({
      label: "depends_on / 供电依赖",
      route: "orthogonal",
      status: "ACTIVE",
      version: 2,
    });
    expect(flow.edges[1]?.data?.route).toBe("curved");
    expect(relationRoute("decomposes_to")).toBe("orthogonal");
    const edgeData = flow.edges[0]?.data;
    if (!edgeData) throw new Error("edge data missing");
    expect(relationEdgeVisual(edgeData, false)).toMatchObject({
      strokeDasharray: "9 4",
    });
  });

  it("unlinks deleted edges through CommandClient with projected version", async () => {
    const commandClient = diagramCommandClient();
    const edge = edgeWithVersion("rel-1", 3);

    await unlinkDiagramEdges(commandClient, "workspace-1", [edge]);

    expect(commandClient.unlink).toHaveBeenCalledWith(
      "workspace-1",
      "rel-1",
      3,
    );
  });

  it("does not unlink when relation version is missing from the view API", async () => {
    const commandClient = diagramCommandClient();
    const edge = edgeWithVersion("rel-1", undefined);

    await expect(
      unlinkDiagramEdges(commandClient, "workspace-1", [edge]),
    ).rejects.toThrow("TODO(view-API)");
    expect(commandClient.unlink).not.toHaveBeenCalled();
  });
});

function object(objectId: string, name: string): ViewObject {
  return {
    objectId,
    objectType: "demo_object",
    status: "DRAFT",
    version: 1,
    fields: { name },
    updatedAt: "2026-06-21T00:00:00Z",
    source: null,
    ruleStatus: "OK",
  };
}

function relation(
  relationId: string,
  relationType: string,
  sourceId: string,
  targetId: string,
  version: number,
  overrides: Partial<Parameters<typeof relationLabel>[0]> = {},
) {
  return {
    relationId,
    relationType,
    sourceId,
    targetId,
    status: "ACTIVE",
    version,
    ...overrides,
  };
}

function edgeWithVersion(id: string, version: number | undefined): DiagramEdge {
  return {
    id,
    source: "obj-a",
    target: "obj-b",
    type: "dataRelation",
    data: {
      label: "depends_on",
      relationType: "depends_on",
      route: "orthogonal",
      version,
    },
  };
}

function diagramCommandClient(): DiagramCommandClient &
  Readonly<Record<keyof DiagramCommandClient, ReturnType<typeof vi.fn>>> {
  return {
    createRelation: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  } as DiagramCommandClient &
    Readonly<Record<keyof DiagramCommandClient, ReturnType<typeof vi.fn>>>;
}
