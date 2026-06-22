import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import type { RelationSummary, ViewObject } from "@m-next/views";

import {
  dataRelationMarker,
  edgeTypes,
  relationRoute,
  type DiagramEdgeData,
} from "./edges";
import {
  PortHandles,
  portHandleId,
  relationPortSides,
  type PortSide,
} from "./ports";
import { useWorkbenchContext } from "./workbench";

export interface DiagramNodeData extends Record<string, unknown> {
  readonly title: string;
  readonly objectType: string;
  readonly status: string;
  readonly fxText: string;
}

export type DiagramNode = Node<DiagramNodeData, "object">;
export type DiagramEdge = Edge<DiagramEdgeData, "dataRelation">;

type DiagramRelationSummary = RelationSummary &
  Partial<{
    readonly fields: Readonly<Record<string, unknown>>;
    readonly hierarchical: boolean;
    readonly status: string;
    readonly version: number;
  }>;

export interface DiagramCommandClient {
  createRelation(
    workspaceId: string,
    relationType: string,
    sourceId: string,
    targetId: string,
  ): Promise<unknown>;
  unlink(
    workspaceId: string,
    relationId: string,
    expectedVersion: number,
  ): Promise<unknown>;
}

export function isDerivedField(code: string): boolean {
  const normalized = code.toLowerCase();
  return (
    normalized === "fx" ||
    normalized.startsWith("fx_") ||
    normalized.endsWith("_fx") ||
    normalized.includes("derived")
  );
}

function ObjectFlowNode({
  data,
  selected,
}: NodeProps<DiagramNode>): ReactElement {
  return (
    <div
      className={selected ? "object-node object-node-selected" : "object-node"}
    >
      <PortHandles />
      <div className="object-node-type">{data.objectType}</div>
      <strong>{data.title}</strong>
      <span>{data.status}</span>
      <small>fx {data.fxText}</small>
    </div>
  );
}

export function objectTitle(object: ViewObject): string {
  const value = object.fields.name ?? object.fields.title ?? object.objectId;
  return String(value);
}

export function objectFxText(object: ViewObject): string {
  const entries = Object.entries(object.fields).filter(([code]) =>
    isDerivedField(code),
  );
  if (entries.length === 0) return "TODO(view-API): 派生值未提供";
  return entries.map(([code, value]) => `${code}=${String(value)}`).join(", ");
}

export function relationLabel(relation: DiagramRelationSummary): string {
  const name = relation.fields?.name ?? relation.fields?.title;
  if (name === undefined || name === null || String(name).trim() === "") {
    return relation.relationType;
  }
  return `${relation.relationType} / ${String(name)}`;
}

function relationStatus(
  relation: DiagramRelationSummary,
): DiagramEdgeData["status"] {
  return relation.status === "UNLINKED" ? "UNLINKED" : "ACTIVE";
}

function relationVersion(relation: DiagramRelationSummary): number | undefined {
  return typeof relation.version === "number" && relation.version > 0
    ? relation.version
    : undefined;
}

function edgePorts(
  sourceNode: DiagramNode | undefined,
  targetNode: DiagramNode | undefined,
): { readonly sourceSide: PortSide; readonly targetSide: PortSide } {
  if (!sourceNode || !targetNode) {
    return { sourceSide: "right", targetSide: "left" };
  }
  return relationPortSides(sourceNode.position, targetNode.position);
}

export function objectsAndRelationsToFlow(
  objects: readonly ViewObject[],
  relations: readonly RelationSummary[],
  selectedObjectId: string | null,
): { readonly nodes: DiagramNode[]; readonly edges: DiagramEdge[] } {
  const nodes = objects.map(
    (object, index): DiagramNode => ({
      id: object.objectId,
      type: "object",
      position: {
        x: 80 + (index % 4) * 240,
        y: 80 + Math.floor(index / 4) * 160,
      },
      selected: object.objectId === selectedObjectId,
      data: {
        title: objectTitle(object),
        objectType: object.objectType,
        status: object.status,
        fxText: objectFxText(object),
      },
    }),
  );
  const objectIds = new Set(objects.map((object) => object.objectId));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = relations
    .filter(
      (relation) =>
        objectIds.has(relation.sourceId) && objectIds.has(relation.targetId),
    )
    .map((relation): DiagramEdge => {
      const projected = relation as DiagramRelationSummary;
      const ports = edgePorts(
        nodesById.get(relation.sourceId),
        nodesById.get(relation.targetId),
      );
      return {
        id: relation.relationId,
        source: relation.sourceId,
        sourceHandle: portHandleId("source", ports.sourceSide),
        target: relation.targetId,
        targetHandle: portHandleId("target", ports.targetSide),
        type: "dataRelation",
        markerEnd: dataRelationMarker,
        data: {
          label: relationLabel(projected),
          relationType: relation.relationType,
          route: relationRoute(relation.relationType),
          status: relationStatus(projected),
          version: relationVersion(projected),
          // TODO(view-API): expose rule hit state before rendering failed edges.
          ruleState: "normal",
        },
      };
    });
  return { nodes, edges };
}

const nodeTypes = { object: ObjectFlowNode };

interface DiagramData {
  readonly objects: readonly ViewObject[];
  readonly relations: readonly RelationSummary[];
}

export async function connectDiagramObjects(
  commandClient: Pick<DiagramCommandClient, "createRelation">,
  workspaceId: string,
  relationType: string,
  connection: Connection,
): Promise<boolean> {
  if (!connection.source || !connection.target) return false;
  await commandClient.createRelation(
    workspaceId,
    relationType,
    connection.source,
    connection.target,
  );
  return true;
}

export async function unlinkDiagramEdges(
  commandClient: Pick<DiagramCommandClient, "unlink">,
  workspaceId: string,
  deletedEdges: readonly DiagramEdge[],
): Promise<void> {
  const versionedEdges = deletedEdges.map((edge) => ({
    id: edge.id,
    version: edge.data?.version,
  }));
  const missingVersion = versionedEdges.find((edge) => !edge.version);
  if (missingVersion) {
    throw new Error("TODO(view-API): 删除关系需要关系版本投影");
  }
  await Promise.all(
    versionedEdges.map((edge) =>
      commandClient.unlink(workspaceId, edge.id, edge.version as number),
    ),
  );
}

export function DiagramPanel(): ReactElement {
  const context = useWorkbenchContext();
  const [data, setData] = useState<DiagramData>({
    objects: [],
    relations: [],
  });
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>([]);

  useEffect(
    () =>
      context.selection.subscribe((selected) => {
        setSelectedObjectId(
          selected?.entityType === "object" ? selected.entityId : null,
        );
      }),
    [context.selection],
  );

  useEffect(() => {
    let disposed = false;
    async function load(): Promise<void> {
      try {
        const page = await context.viewClient.objects(
          context.workspaceId,
          context.objectType,
          0,
          100,
        );
        const sourceId = context.rootId || page.items[0]?.objectId;
        const relations = sourceId
          ? await context.viewClient.relations(
              context.workspaceId,
              context.relationType,
              "out",
              sourceId,
              2,
            )
          : [];
        if (!disposed) setData({ objects: page.items, relations });
      } catch (error) {
        if (!disposed) {
          context.reportError(
            error instanceof Error ? error.message : "读取图面板失败",
          );
          setData({ objects: [], relations: [] });
        }
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [context]);

  useEffect(() => {
    const flow = objectsAndRelationsToFlow(
      data.objects,
      data.relations,
      selectedObjectId,
    );
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [data, selectedObjectId, setEdges, setNodes]);

  const onNodeClick = useMemo<NodeMouseHandler<DiagramNode>>(
    () => (_event, node) => {
      context.selection.select({ entityType: "object", entityId: node.id });
    },
    [context.selection],
  );

  async function connectObjects(connection: Connection): Promise<void> {
    try {
      const connected = await connectDiagramObjects(
        context.commandClient,
        context.workspaceId,
        context.relationType,
        connection,
      );
      if (connected) context.refreshViews();
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "创建关系失败",
      );
    }
  }

  async function deleteRelations(deletedEdges: DiagramEdge[]): Promise<void> {
    try {
      await unlinkDiagramEdges(
        context.commandClient,
        context.workspaceId,
        deletedEdges,
      );
      context.refreshViews();
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "删除关系失败",
      );
    }
  }

  return (
    <section aria-label="图面板" className="diagram-panel">
      <ReactFlow
        deleteKeyCode={["Backspace", "Delete"]}
        edgeTypes={edgeTypes}
        edges={edges}
        fitView
        nodeTypes={nodeTypes}
        nodes={nodes}
        onConnect={(connection) => void connectObjects(connection)}
        onEdgesDelete={(deletedEdges) => void deleteRelations(deletedEdges)}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodesChange={onNodesChange}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </section>
  );
}
