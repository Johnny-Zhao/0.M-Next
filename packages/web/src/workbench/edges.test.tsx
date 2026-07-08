import { describe, expect, it, vi } from "vitest";

import type { ViewObject } from "@m-next/views";

import {
  connectDiagramObjects,
  containsRelationCodesForObjectType,
  defaultDiagramObjectFields,
  diagramConnectionRejection,
  diagramRelationCodesForVisibleObjects,
  inferDiagramRelationType,
  loadDiagramRelations,
  mergeOptimisticDiagramObjects,
  mergeOptimisticDiagramRelations,
  objectDerivedChips,
  optimisticDiagramObject,
  optimisticDiagramRelation,
  objectsAndRelationsToFlow,
  pickCreatedDiagramObjectId,
  relationLabel,
  refreshDiagramAfterRelationCreated,
  resolveDiagramConnectionEndpoints,
  unlinkDiagramEdges,
  unlinkSelectedRelations,
  upsertOptimisticDiagramNode,
  type DiagramCommandClient,
  type DiagramEdge,
  type DiagramNode,
} from "./diagram-panel";
import { relationEdgeVisual, relationRoute } from "./edges";

describe("diagram relation edges", () => {
  it("uses required defaults for right-click object creation", () => {
    expect(defaultDiagramObjectFields).toEqual({ name: "新模块", power_w: 0 });
  });

  it("maps created technical proposal objects to contains relations", () => {
    expect(containsRelationCodesForObjectType("module")).toEqual([
      "proposal_contains_module",
    ]);
    expect(containsRelationCodesForObjectType("system")).toEqual([
      "proposal_contains_system",
    ]);
    expect(containsRelationCodesForObjectType("interface")).toEqual([
      "proposal_contains_interface",
    ]);
  });

  it("resolves the freshly created object before attaching it to the root", () => {
    const knownIds = new Set(["old-module"]);

    expect(
      pickCreatedDiagramObjectId({
        knownIds,
        expectedName: "新模块",
        objects: [
          object("old-module", "旧模块"),
          object("new-module", "新模块"),
        ],
      }),
    ).toBe("new-module");
  });

  it("infers the unique technical proposal relation from endpoint types", () => {
    const relationTypes = [
      relationType("rel-depends", "proposal_depends_on"),
      relationType("rel-interface", "proposal_interfaces_with"),
      relationType("rel-satisfies", "proposal_satisfies"),
    ];

    expect(
      inferDiagramRelationType({
        relationTypes,
        sourceObjectType: "module",
        targetObjectType: "module",
      }),
    ).toEqual({
      kind: "match",
      relationTypeCode: "proposal_depends_on",
      relationTypeId: "rel-depends",
    });
    expect(
      inferDiagramRelationType({
        relationTypes,
        sourceObjectType: "module",
        targetObjectType: "interface",
      }),
    ).toMatchObject({ kind: "match", relationTypeId: "rel-interface" });
    expect(
      inferDiagramRelationType({
        relationTypes,
        sourceObjectType: "module",
        targetObjectType: "requirement",
      }),
    ).toMatchObject({ kind: "match", relationTypeId: "rel-satisfies" });
    expect(
      inferDiagramRelationType({
        relationTypes: [
          relationType("rel-contains-module", "proposal_contains_module"),
        ],
        sourceObjectType: "proposal_node",
        targetObjectType: "module",
      }),
    ).toMatchObject({
      kind: "match",
      relationTypeId: "rel-contains-module",
    });
  });

  it("rejects endpoint pairs that have no legal relation", () => {
    expect(
      inferDiagramRelationType({
        relationTypes: [relationType("rel-depends", "proposal_depends_on")],
        sourceObjectType: "interface",
        targetObjectType: "requirement",
      }),
    ).toEqual({ kind: "none" });
  });

  it("marks duplicate endpoint matches as ambiguous", () => {
    expect(
      inferDiagramRelationType({
        relationTypes: [
          relationType("rel-a", "proposal_depends_on"),
          relationType("rel-b", "proposal_depends_on"),
        ],
        sourceObjectType: "module",
        targetObjectType: "module",
      }),
    ).toEqual({ kind: "ambiguous" });
  });

  it("refreshes immediately and once more after relation creation", () => {
    const refreshViews = vi.fn();
    const scheduleRefresh = vi.fn();

    refreshDiagramAfterRelationCreated({ refreshViews, scheduleRefresh });

    expect(refreshViews).toHaveBeenCalledTimes(1);
    expect(scheduleRefresh).toHaveBeenCalledWith(refreshViews, 400);
  });

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
      "diagram",
    );
  });

  it("loads dependency relations between visible module nodes", async () => {
    const dependsOn = relation(
      "rel-depends",
      "proposal_depends_on",
      "module-a",
      "module-b",
      1,
    );
    const viewClient = {
      relationTypes: vi.fn(async () => [
        relationType("type-contains", "proposal_contains_module"),
        relationType("type-depends", "proposal_depends_on"),
      ]),
      relations: vi.fn(
        async (
          _workspaceId: string,
          relationTypeCode: string,
          _direction: string,
          sourceId: string,
        ) =>
          relationTypeCode === "proposal_depends_on" && sourceId === "module-a"
            ? [dependsOn]
            : [],
      ),
    };

    const loaded = await loadDiagramRelations({
      viewClient,
      workspaceId: "workspace-1",
      relationType: "proposal_contains_module",
      rootId: "proposal-root",
      objects: [
        typedObject("module-a", "模块A", "module"),
        typedObject("module-b", "模块B", "module"),
      ],
    });

    expect(loaded).toEqual([dependsOn]);
    expect(
      diagramRelationCodesForVisibleObjects({
        objects: [
          typedObject("module-a", "模块A", "module"),
          typedObject("module-b", "模块B", "module"),
        ],
        relationType: "proposal_contains_module",
        relationTypes: [
          relationType("type-contains", "proposal_contains_module"),
          relationType("type-depends", "proposal_depends_on"),
        ],
      }),
    ).toEqual(["proposal_contains_module", "proposal_depends_on"]);
    expect(viewClient.relations).toHaveBeenCalledWith(
      "workspace-1",
      "proposal_depends_on",
      "out",
      "module-a",
      1,
    );
  });

  it("resolves connection endpoints from visible nodes when object data is stale", () => {
    expect(
      resolveDiagramConnectionEndpoints({
        objects: [
          typedObject("module-a", "妯″潡A", "module"),
          typedObject("module-new", "旧投影", "interface"),
        ],
        nodes: [
          flowNode("module-a", "module"),
          flowNode("module-new", "module", "module-new-from-node"),
        ],
        connection: {
          source: "module-new",
          sourceHandle: "source-right",
          target: "module-a",
          targetHandle: "target-left",
        },
      }),
    ).toEqual({
      source: { objectId: "module-new-from-node", objectType: "module" },
      target: { objectId: "module-a", objectType: "module" },
    });
  });

  it("adds a complete optimistic node for a freshly created object", () => {
    const optimistic = optimisticDiagramObject({
      objectId: "module-new",
      objectType: "module",
      fields: defaultDiagramObjectFields,
    });
    const nodes = upsertOptimisticDiagramNode({
      nodes: [flowNode("module-a", "module")],
      object: optimistic,
      activeDimension: "all",
    });

    expect(nodes[1]?.data).toMatchObject({
      objectId: "module-new",
      objectType: "module",
      title: "新模块",
    });
    expect(
      resolveDiagramConnectionEndpoints({
        objects: [],
        nodes,
        connection: {
          source: "module-new",
          sourceHandle: "source-right",
          target: "module-a",
          targetHandle: "target-left",
        },
      })?.source,
    ).toEqual({ objectId: "module-new", objectType: "module" });
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
      label: "关系 / 供电依赖",
      route: "orthogonal",
      status: "ACTIVE",
      version: 2,
    });
    expect(flow.edges[1]?.data?.route).toBe("curved");
    expect(relationRoute("decomposes_to")).toBe("orthogonal");
    const edgeData = flow.edges[0]?.data;
    if (!edgeData) throw new Error("edge data missing");
    expect(relationEdgeVisual(edgeData, false)).toMatchObject({
      color: "var(--mn-warn)",
      strokeDasharray: "9 4",
    });
  });

  it("uses Fluent tokens for edge visual states", () => {
    expect(relationEdgeVisual(edgeData("contains"), false)).toMatchObject({
      color: "var(--mn-border-3)",
      marker: "arrow",
    });
    expect(relationEdgeVisual(edgeData("depends_on"), false)).toMatchObject({
      color: "var(--mn-warn)",
      strokeDasharray: "9 4",
    });
    expect(relationEdgeVisual(edgeData("adjacent"), false)).toMatchObject({
      color: "var(--mn-ink-3)",
      marker: "none",
      strokeDasharray: "2 6",
    });
    expect(
      relationEdgeVisual(
        { ...edgeData("adjacent"), status: "UNLINKED" },
        false,
      ),
    ).toMatchObject({
      color: "var(--mn-ink-3)",
      marker: "none",
      strokeDasharray: "7 5",
    });
    expect(
      relationEdgeVisual(
        { ...edgeData("depends_on"), ruleState: "failed" },
        false,
      ),
    ).toMatchObject({
      color: "var(--mn-bad)",
      strokeWidth: 3,
    });
    expect(relationEdgeVisual(edgeData("depends_on"), true)).toMatchObject({
      color: "var(--mn-accent)",
      strokeWidth: 3,
    });
  });

  it("formats real derived values as separate fx chips", () => {
    const chips = objectDerivedChips({
      ...object("obj-a", "客厅"),
      derived: { area_fx: 23.5, window_floor_ratio_fx: 0.078333 },
    });

    expect(chips).toEqual([
      { fieldCode: "area_fx", label: "面积", value: "23.5", unit: "㎡" },
      { fieldCode: "window_floor_ratio_fx", label: "窗地比", value: "0.078" },
    ]);
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

  it("unlinks right-click selected relations with their real version, not a hardcoded 1", async () => {
    const commandClient = diagramCommandClient();

    await unlinkSelectedRelations(commandClient, "workspace-1", [
      relation("rel-1", "depends_on", "obj-a", "obj-b", 3),
      relation("rel-2", "trace_to", "obj-a", "obj-c", 5),
    ]);

    expect(commandClient.unlink).toHaveBeenCalledWith("workspace-1", "rel-1", 3);
    expect(commandClient.unlink).toHaveBeenCalledWith("workspace-1", "rel-2", 5);
    // regression: previously deleteSelection sent expectedVersion=1 for every
    // relation, so any relation whose real version != 1 failed the kernel's
    // optimistic-lock check and the right-click "删除关系" appeared to do nothing.
    expect(commandClient.unlink).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.anything(),
      1,
    );
  });

  it("refuses to unlink a selected relation that lacks a usable version", async () => {
    const commandClient = diagramCommandClient();

    await expect(
      unlinkSelectedRelations(commandClient, "workspace-1", [
        relation("rel-1", "depends_on", "obj-a", "obj-b", 0),
      ]),
    ).rejects.toThrow("TODO(view-API)");
    expect(commandClient.unlink).not.toHaveBeenCalled();
  });

  it("reverse-matches a relation when the user drags the wrong way", () => {
    const relationTypes = [
      relationType("rel-interface", "proposal_interfaces_with"),
      relationType("rel-contains-module", "proposal_contains_module"),
    ];

    // forward drag module -> interface
    expect(
      inferDiagramRelationType({
        relationTypes,
        sourceObjectType: "module",
        targetObjectType: "interface",
      }),
    ).toEqual({
      kind: "match",
      relationTypeCode: "proposal_interfaces_with",
      relationTypeId: "rel-interface",
    });

    // reverse drag interface -> module resolves the same type, flagged reversed
    expect(
      inferDiagramRelationType({
        relationTypes,
        sourceObjectType: "interface",
        targetObjectType: "module",
      }),
    ).toEqual({
      kind: "match",
      relationTypeCode: "proposal_interfaces_with",
      relationTypeId: "rel-interface",
      reversed: true,
    });

    // reverse drag module -> proposal resolves proposal_contains_module
    expect(
      inferDiagramRelationType({
        relationTypes,
        sourceObjectType: "module",
        targetObjectType: "proposal",
      }),
    ).toMatchObject({
      kind: "match",
      relationTypeId: "rel-contains-module",
      reversed: true,
    });
  });

  it("rejects self-loops and duplicate relations before issuing a command", () => {
    expect(
      diagramConnectionRejection({
        sourceId: "obj-a",
        targetId: "obj-a",
        relationTypeCode: "proposal_depends_on",
        relations: [],
      }),
    ).toBe("self");

    expect(
      diagramConnectionRejection({
        sourceId: "obj-a",
        targetId: "obj-b",
        relationTypeCode: "proposal_depends_on",
        relations: [
          relation("rel-1", "proposal_depends_on", "obj-a", "obj-b", 2),
        ],
      }),
    ).toBe("duplicate");

    expect(
      diagramConnectionRejection({
        sourceId: "obj-a",
        targetId: "obj-b",
        relationTypeCode: "proposal_depends_on",
        relations: [
          relation("rel-1", "proposal_depends_on", "obj-a", "obj-c", 2),
        ],
      }),
    ).toBeNull();
  });

  it("renders an optimistic relation as an immediate edge before refresh", () => {
    const optimistic = optimisticDiagramRelation({
      relationType: "proposal_depends_on",
      sourceId: "obj-a",
      targetId: "obj-b",
    });

    const flow = objectsAndRelationsToFlow(
      [object("obj-a", "对象A"), object("obj-b", "对象B")],
      [optimistic],
      null,
    );

    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0]).toMatchObject({
      source: "obj-a",
      target: "obj-b",
      type: "dataRelation",
    });
    expect(optimistic.relationId).toContain("optimistic-rel:");
  });

  it("keeps just-created optimistic objects when a connect reload runs", () => {
    const reloaded = [object("obj-a", "对象A"), object("obj-b", "对象B")];
    const current = [
      object("obj-a", "对象A"),
      optimisticDiagramObject({
        objectId: "obj-new",
        objectType: "module",
        fields: { name: "刚建模块" },
      }),
    ];

    expect(
      mergeOptimisticDiagramObjects(reloaded, current).map(
        (object) => object.objectId,
      ),
    ).toEqual(["obj-a", "obj-b", "obj-new"]);
  });

  it("preserves unsynced optimistic relations but drops those already reloaded", () => {
    const reloaded = [
      relation("rel-real", "proposal_depends_on", "obj-a", "obj-b", 4),
    ];
    const current = [
      optimisticDiagramRelation({
        relationType: "proposal_depends_on",
        sourceId: "obj-a",
        targetId: "obj-b",
      }),
      optimisticDiagramRelation({
        relationType: "proposal_depends_on",
        sourceId: "obj-c",
        targetId: "obj-d",
      }),
    ];

    expect(
      mergeOptimisticDiagramRelations(reloaded, current).map(
        (relation) => relation.relationId,
      ),
    ).toEqual([
      "rel-real",
      "optimistic-rel:obj-c->obj-d:proposal_depends_on",
    ]);
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

function typedObject(
  objectId: string,
  name: string,
  objectType: string,
): ViewObject {
  return { ...object(objectId, name), objectType };
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

function relationType(id: string, code: string) {
  return { id, code, name: code, hierarchical: false };
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

function flowNode(id: string, objectType: string, objectId = id): DiagramNode {
  return {
    id,
    type: "object",
    position: { x: 0, y: 0 },
    data: {
      objectId,
      title: id,
      objectType,
      status: "DRAFT",
      code: objectType,
      typeVariant: "component",
      fields: [],
      derivedChips: [],
      ruleStatus: "OK",
      provenanceText: null,
      visualState: "default",
      readonly: false,
    },
  };
}

function edgeData(relationType: string): NonNullable<DiagramEdge["data"]> {
  return {
    label: relationType,
    relationType,
    route: relationRoute(relationType),
    status: "ACTIVE",
    ruleState: "normal",
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
