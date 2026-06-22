import {
  Background,
  Controls,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";

import type { RelationSummary, ViewObject } from "@m-next/views";

import {
  copyObjectsToClipboard,
  hasDiagramClipboard,
  readDiagramClipboard,
} from "./clipboard";
import {
  DiagramContextMenu,
  type DiagramContextMenuState,
} from "./context-menu";
import {
  createObjectByCommand,
  diagramShortcutFromEvent,
  softDeleteObjectByCommand,
  type DiagramShortcut,
} from "./shortcuts";
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
  selectedObjectIds: string | readonly string[] | null,
): { readonly nodes: DiagramNode[]; readonly edges: DiagramEdge[] } {
  const selectedIds = normalizeSelectedIds(selectedObjectIds);
  const nodes = objects.map(
    (object, index): DiagramNode => ({
      id: object.objectId,
      type: "object",
      position: {
        x: 80 + (index % 4) * 240,
        y: 80 + Math.floor(index / 4) * 160,
      },
      selected: selectedIds.has(object.objectId),
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

function normalizeSelectedIds(
  selectedObjectIds: string | readonly string[] | null,
): ReadonlySet<string> {
  if (!selectedObjectIds) return new Set();
  return new Set(
    typeof selectedObjectIds === "string"
      ? [selectedObjectIds]
      : selectedObjectIds,
  );
}

const nodeTypes = { object: ObjectFlowNode };

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
  const [selectedNodeIds, setSelectedNodeIds] = useState<readonly string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<readonly string[]>([]);
  const [menu, setMenu] = useState<DiagramContextMenuState | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>([]);

  useEffect(
    () =>
      context.selection.subscribe((selected) => {
        const objectId =
          selected?.entityType === "object" ? selected.entityId : null;
        setSelectedObjectId(objectId);
        setSelectedNodeIds(objectId ? [objectId] : []);
        setSelectedEdgeIds([]);
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
      selectedNodeIds.length > 0 ? selectedNodeIds : selectedObjectId,
    );
    setNodes(flow.nodes);
    setEdges(
      flow.edges.map((edge) => ({
        ...edge,
        selected: selectedEdgeIds.includes(edge.id),
      })),
    );
  }, [
    data,
    selectedEdgeIds,
    selectedNodeIds,
    selectedObjectId,
    setEdges,
    setNodes,
  ]);

  const onNodeClick = useMemo<NodeMouseHandler<DiagramNode>>(
    () => (_event, node) => {
      context.selection.select({ entityType: "object", entityId: node.id });
    },
    [context.selection],
  );

  const onSelectionChange = useCallback(
    (selection: OnSelectionChangeParams<DiagramNode, DiagramEdge>) => {
      const nodeIds = selection.nodes.map((node) => node.id);
      setSelectedNodeIds(nodeIds);
      setSelectedEdgeIds(selection.edges.map((edge) => edge.id));
      if (nodeIds.length === 1) {
        context.selection.select({
          entityType: "object",
          entityId: nodeIds[0],
        });
      } else {
        setSelectedObjectId(null);
      }
    },
    [context.selection],
  );

  const onNodeContextMenu = useMemo<NodeMouseHandler<DiagramNode>>(
    () => (event, node) => {
      event.preventDefault();
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      context.selection.select({ entityType: "object", entityId: node.id });
      setMenu({
        context: { kind: "node", nodeId: node.id },
        x: event.clientX,
        y: event.clientY,
      });
    },
    [context.selection],
  );

  const onEdgeContextMenu = useMemo<EdgeMouseHandler<DiagramEdge>>(
    () => (event, edge) => {
      event.preventDefault();
      setSelectedNodeIds([]);
      setSelectedEdgeIds([edge.id]);
      setMenu({
        context: { kind: "edge", edgeId: edge.id },
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  function openPaneMenu(event: MouseEvent | ReactMouseEvent): void {
    event.preventDefault();
    setMenu({ context: { kind: "pane" }, x: event.clientX, y: event.clientY });
  }

  const selectedObjects = useMemo(
    () =>
      data.objects.filter((object) =>
        selectedNodeIds.includes(object.objectId),
      ),
    [data.objects, selectedNodeIds],
  );

  const selectedRelations = useMemo(
    () =>
      data.relations.filter((relation) =>
        selectedEdgeIds.includes(relation.relationId),
      ),
    [data.relations, selectedEdgeIds],
  );

  function copySelection(): void {
    if (selectedObjects.length > 0) copyObjectsToClipboard(selectedObjects);
    setMenu(null);
  }

  async function createObject(fields = {}): Promise<void> {
    try {
      await createObjectByCommand(
        context.commandClient,
        context.workspaceId,
        context.objectType,
        fields,
        "diagram-panel",
      );
      context.refreshViews();
    } catch (error) {
      context.reportError(errorMessage(error, "新建对象失败"));
    } finally {
      setMenu(null);
    }
  }

  async function pasteClipboard(): Promise<void> {
    const clipboard = readDiagramClipboard();
    if (!clipboard) return;
    try {
      for (const object of clipboard.objects) {
        await createObjectByCommand(
          context.commandClient,
          context.workspaceId,
          object.objectType,
          object.fields,
          "diagram-copy-paste",
        );
      }
      context.refreshViews();
    } catch (error) {
      context.reportError(errorMessage(error, "粘贴对象失败"));
    } finally {
      setMenu(null);
    }
  }

  async function duplicateSelection(): Promise<void> {
    copySelection();
    await pasteClipboard();
  }

  async function deleteSelection(): Promise<void> {
    if (selectedObjects.length === 0 && selectedRelations.length === 0) return;
    try {
      for (const relation of selectedRelations) {
        await context.commandClient.unlink(
          context.workspaceId,
          relation.relationId,
          1,
        );
      }
      for (const object of selectedObjects) {
        await softDeleteObjectByCommand(
          context.commandClient,
          context.workspaceId,
          object,
        );
      }
      clearSelection();
      context.refreshViews();
    } catch (error) {
      context.reportError(errorMessage(error, "删除选择失败"));
    } finally {
      setMenu(null);
    }
  }

  function selectAll(): void {
    setSelectedNodeIds(nodes.map((node) => node.id));
    setSelectedEdgeIds(edges.map((edge) => edge.id));
    setMenu(null);
  }

  function clearSelection(): void {
    setSelectedObjectId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setMenu(null);
  }

  function viewDetail(): void {
    const nodeId = menu?.context.kind === "node" ? menu.context.nodeId : null;
    if (nodeId)
      context.selection.select({ entityType: "object", entityId: nodeId });
    setMenu(null);
  }

  function runShortcut(shortcut: DiagramShortcut): void {
    if (shortcut === "clearSelection") clearSelection();
    if (shortcut === "copy") copySelection();
    if (shortcut === "delete") void deleteSelection();
    if (shortcut === "duplicate") void duplicateSelection();
    if (shortcut === "paste") void pasteClipboard();
    if (shortcut === "selectAll") selectAll();
  }

  function handleKeyDown(event: ReactKeyboardEvent): void {
    const shortcut = diagramShortcutFromEvent(event.nativeEvent);
    if (!shortcut) return;
    event.preventDefault();
    runShortcut(shortcut);
  }

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
    <section
      aria-label="图面板"
      className="diagram-panel"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        edges={edges}
        fitView
        nodeTypes={nodeTypes}
        nodes={nodes}
        onConnect={(connection) => void connectObjects(connection)}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgesChange={onEdgesChange}
        onNodeContextMenu={onNodeContextMenu}
        onNodeClick={onNodeClick}
        onNodesChange={onNodesChange}
        onPaneContextMenu={openPaneMenu}
        onSelectionChange={onSelectionChange}
        selectNodesOnDrag
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
      >
        <Background />
        <Controls />
      </ReactFlow>
      {menu ? (
        <DiagramContextMenu
          canPaste={hasDiagramClipboard()}
          menu={menu}
          onClose={() => setMenu(null)}
          onCopy={copySelection}
          onCreateObject={() => void createObject()}
          onDelete={() => void deleteSelection()}
          onDuplicate={() => void duplicateSelection()}
          onPaste={() => void pasteClipboard()}
          onSelectAll={selectAll}
          onViewDetail={viewDetail}
        />
      ) : null}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
