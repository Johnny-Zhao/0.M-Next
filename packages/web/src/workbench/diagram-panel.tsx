import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";

import type { RelationSummary, ViewObject } from "@m-next/views";

import {
  alignNodes,
  distributeNodes,
  type AlignCommand,
  type DistributeCommand,
} from "./align";
import {
  calculateSmartGuides,
  SmartGuidesOverlay,
  type SmartGuides,
} from "./guides";
import { useWorkbenchContext } from "./workbench";

export interface DiagramNodeData extends Record<string, unknown> {
  readonly title: string;
  readonly objectType: string;
  readonly status: string;
  readonly fxText: string;
}

export type DiagramNode = Node<DiagramNodeData, "object">;
export type DiagramEdge = Edge<{ readonly relationType: string }>;

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
  const edges = relations
    .filter(
      (relation) =>
        objectIds.has(relation.sourceId) && objectIds.has(relation.targetId),
    )
    .map(
      (relation): DiagramEdge => ({
        id: relation.relationId,
        source: relation.sourceId,
        target: relation.targetId,
        label: relation.relationType,
        data: { relationType: relation.relationType },
      }),
    );
  return { nodes, edges };
}

const nodeTypes = { object: ObjectFlowNode };
const snapGrid: [number, number] = [24, 24];
const noGuides: SmartGuides = { x: [], y: [] };

function selectedIdsFor(nodes: readonly DiagramNode[]): ReadonlySet<string> {
  return new Set(nodes.filter((node) => node.selected).map((node) => node.id));
}

interface DiagramData {
  readonly objects: readonly ViewObject[];
  readonly relations: readonly RelationSummary[];
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
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridVariant, setGridVariant] = useState<BackgroundVariant>(
    BackgroundVariant.Dots,
  );
  const [guides, setGuides] = useState<SmartGuides>(noGuides);
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes],
  );

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
    setNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]));
      return flow.nodes.map((node) => {
        const current = currentById.get(node.id);
        if (!current) return node;
        return {
          ...node,
          position: current.position,
          width: current.width,
          height: current.height,
          measured: current.measured,
        };
      });
    });
    setEdges(flow.edges);
  }, [data, selectedObjectId, setEdges, setNodes]);

  const onNodeClick = useMemo<NodeMouseHandler<DiagramNode>>(
    () => (_event, node) => {
      context.selection.select({ entityType: "object", entityId: node.id });
    },
    [context.selection],
  );

  const alignSelected = useCallback(
    (command: AlignCommand) => {
      setNodes((currentNodes) =>
        alignNodes(currentNodes, selectedIdsFor(currentNodes), command),
      );
    },
    [setNodes],
  );

  const distributeSelected = useCallback(
    (command: DistributeCommand) => {
      setNodes((currentNodes) =>
        distributeNodes(currentNodes, selectedIdsFor(currentNodes), command),
      );
    },
    [setNodes],
  );

  const onNodeDrag = useCallback<OnNodeDrag<DiagramNode>>(
    (_event, node) => {
      setGuides(calculateSmartGuides(node, nodes));
    },
    [nodes],
  );

  const clearGuides = useCallback<OnNodeDrag<DiagramNode>>(() => {
    setGuides(noGuides);
  }, []);

  async function connectObjects(connection: Connection): Promise<void> {
    if (!connection.source || !connection.target) return;
    try {
      await context.commandClient.createRelation(
        context.workspaceId,
        context.relationType,
        connection.source,
        connection.target,
      );
      context.refreshViews();
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "创建关系失败",
      );
    }
  }

  return (
    <section aria-label="图面板" className="diagram-panel">
      <div className="diagram-grid-controls">
        <label>
          <input
            checked={gridEnabled}
            onChange={(event) => setGridEnabled(event.target.checked)}
            type="checkbox"
          />
          网格
        </label>
        <select
          aria-label="网格样式"
          disabled={!gridEnabled}
          onChange={(event) =>
            setGridVariant(event.target.value as BackgroundVariant)
          }
          value={gridVariant}
        >
          <option value={BackgroundVariant.Dots}>点</option>
          <option value={BackgroundVariant.Lines}>线</option>
        </select>
      </div>
      {selectedNodeIds.length > 1 ? (
        <div className="diagram-align-toolbar" role="toolbar">
          <button onClick={() => alignSelected("left")} title="左对齐">
            左
          </button>
          <button onClick={() => alignSelected("right")} title="右对齐">
            右
          </button>
          <button onClick={() => alignSelected("top")} title="顶对齐">
            顶
          </button>
          <button onClick={() => alignSelected("bottom")} title="底对齐">
            底
          </button>
          <button
            onClick={() => alignSelected("horizontalCenter")}
            title="水平居中"
          >
            中X
          </button>
          <button
            onClick={() => alignSelected("verticalCenter")}
            title="垂直居中"
          >
            中Y
          </button>
          <button
            onClick={() => distributeSelected("horizontal")}
            title="水平分布"
          >
            横分
          </button>
          <button
            onClick={() => distributeSelected("vertical")}
            title="垂直分布"
          >
            竖分
          </button>
        </div>
      ) : null}
      <ReactFlow
        edges={edges}
        fitView
        nodeTypes={nodeTypes}
        nodes={nodes}
        onConnect={(connection) => void connectObjects(connection)}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={clearGuides}
        onNodesChange={onNodesChange}
        snapGrid={snapGrid}
        snapToGrid={gridEnabled}
      >
        {gridEnabled ? (
          <Background gap={snapGrid} variant={gridVariant} />
        ) : null}
        <SmartGuidesOverlay guides={guides} />
        <Controls />
      </ReactFlow>
    </section>
  );
}
