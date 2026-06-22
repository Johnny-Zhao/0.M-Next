import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type OnNodeDrag,
  type NodeMouseHandler,
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
import {
  dataRelationMarker,
  edgeTypes,
  relationRoute,
  type DiagramEdgeData,
} from "./edges";
import {
  ObjectNode,
  type ObjectDimensionTone,
  type ObjectFieldPreview,
  type ObjectFlowNode,
  type ObjectNodeData,
  type ObjectTypeVariant,
} from "./object-node";
import {
  DIMENSIONS,
  fieldDimension,
  type ActiveDimensionId,
  type DimensionDefinition,
} from "./dimensions";
import { portHandleId, relationPortSides, type PortSide } from "./ports";
import { useWorkbenchContext } from "./workbench";

export type DiagramNode = ObjectFlowNode;
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

export function objectTitle(object: ViewObject): string {
  const value = object.fields.name ?? object.fields.title ?? object.objectId;
  return String(value);
}

export function objectCode(object: ViewObject): string {
  const value = object.fields.code ?? object.fields.identifier;
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    return String(value);
  }
  return object.objectId.slice(0, 8).toUpperCase();
}

export function objectFxText(object: ViewObject): string {
  const entries = Object.entries(object.fields).filter(([code]) =>
    isDerivedField(code),
  );
  if (entries.length === 0) return "TODO(view-API): 派生值未提供";
  return entries.map(([code, value]) => `${code}=${String(value)}`).join(", ");
}

export function objectTypeVariant(objectType: string): ObjectTypeVariant {
  const normalized = objectType.toLowerCase();
  if (normalized.includes("subsystem") || objectType.includes("分系统")) {
    return "subsystem";
  }
  if (normalized.includes("interface") || objectType.includes("接口")) {
    return "interface";
  }
  if (normalized.includes("requirement") || objectType.includes("需求")) {
    return "requirement";
  }
  return "component";
}

export function objectFieldPreviews(
  object: ViewObject,
  activeDimension: ActiveDimensionId = "all",
): readonly ObjectFieldPreview[] {
  return Object.entries(object.fields)
    .filter(
      ([code]) =>
        !isDerivedField(code) &&
        !reservedObjectFieldCodes.has(code) &&
        (activeDimension === "all" || fieldDimension(code) === activeDimension),
    )
    .slice(0, 2)
    .map(([code, value]) => ({ code, value: String(value) }));
}

export function objectReadonly(object: ViewObject): boolean {
  const status = object.status.toLowerCase();
  const source = String(object.fields.source ?? "").toLowerCase();
  return status.includes("readonly") || source === "artifact_sync";
}

function dimensionDefinition(
  activeDimension: ActiveDimensionId,
): DimensionDefinition | undefined {
  if (activeDimension === "all") return undefined;
  return DIMENSIONS.find((dimension) => dimension.id === activeDimension);
}

function objectDimensionTone(
  ruleStatus: ObjectNodeData["ruleStatus"],
  fields: readonly ObjectFieldPreview[],
): ObjectDimensionTone {
  if (fields.length === 0) return "empty";
  if (ruleStatus === "BLOCK") return "block";
  if (ruleStatus === "WARN") return "warn";
  if (ruleStatus === "OK") return "ok";

  const valueText = fields
    .map((field) => field.value)
    .join(" ")
    .toLowerCase();
  if (/block|fail|error|critical|超限|阻断|故障/.test(valueText)) {
    return "block";
  }
  if (/warn|stale|risk|low|high|告警|风险|偏低|偏高/.test(valueText)) {
    return "warn";
  }
  return "normal";
}

export function objectNodeData(
  object: ViewObject,
  activeDimension: ActiveDimensionId = "all",
): ObjectNodeData {
  const fields = objectFieldPreviews(object, activeDimension);
  const dimension = dimensionDefinition(activeDimension);
  const dimensionTone = dimension
    ? objectDimensionTone(object.ruleStatus, fields)
    : undefined;
  return {
    title: objectTitle(object),
    objectType: object.objectType,
    status: object.status,
    code: objectCode(object),
    typeVariant: objectTypeVariant(object.objectType),
    fields,
    fxText: objectFxText(object),
    ruleStatus: object.ruleStatus,
    activeDimension: dimension?.id,
    dimensionLabel: dimension?.label,
    dimensionTone,
    dimensionEmpty: Boolean(dimension && fields.length === 0),
    provenanceText: `${object.status} / TODO(view-API): provenance`,
    visualState: "default",
    readonly: objectReadonly(object),
  };
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
  selectedObjectIds: string | readonly string[] | null,
  activeDimension: ActiveDimensionId = "all",
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
      data: objectNodeData(object, activeDimension),
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

const nodeTypes = { object: ObjectNode };
const snapGrid: [number, number] = [24, 24];
const noGuides: SmartGuides = { x: [], y: [] };
const reservedObjectFieldCodes = new Set([
  "code",
  "identifier",
  "ruleStatus",
  "checkStatus",
  "source",
  "provenanceSource",
  "freshness",
  "freshnessStatus",
  "downstreamCount",
  "dependencyCount",
  "uiState",
  "visualState",
]);

function selectedIdsFor(nodes: readonly DiagramNode[]): ReadonlySet<string> {
  return new Set(nodes.filter((node) => node.selected).map((node) => node.id));
}

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
  const [selectedNodeIds, setSelectedNodeIds] = useState<readonly string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<readonly string[]>([]);
  const [menu, setMenu] = useState<DiagramContextMenuState | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>([]);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridVariant, setGridVariant] = useState<BackgroundVariant>(
    BackgroundVariant.Dots,
  );
  const [activeDimension, setActiveDimension] =
    useState<ActiveDimensionId>("all");
  const [guides, setGuides] = useState<SmartGuides>(noGuides);

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
      activeDimension,
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
    setEdges(
      flow.edges.map((edge) => ({
        ...edge,
        selected: selectedEdgeIds.includes(edge.id),
      })),
    );
  }, [
    data,
    activeDimension,
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

  const activeDimensionDefinition = useMemo(
    () => dimensionDefinition(activeDimension),
    [activeDimension],
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
    <section
      aria-label="图面板"
      className="diagram-panel"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        aria-label="维度"
        className="diagram-dimension-switcher"
        role="toolbar"
      >
        <span>维度:</span>
        <button
          aria-pressed={activeDimension === "all"}
          onClick={() => setActiveDimension("all")}
          type="button"
        >
          全部
        </button>
        {DIMENSIONS.map((dimension) => (
          <button
            aria-pressed={activeDimension === dimension.id}
            className={`dimension-button-${dimension.id}`}
            key={dimension.id}
            onClick={() => setActiveDimension(dimension.id)}
            type="button"
          >
            {dimension.label}
          </button>
        ))}
      </div>
      <div
        className={[
          "diagram-dimension-legend",
          activeDimensionDefinition
            ? `diagram-dimension-legend-${activeDimensionDefinition.id}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="dimension-legend-ramp" aria-hidden="true" />
        <strong>{activeDimensionDefinition?.label ?? "全部"}</strong>
        <span>{activeDimensionDefinition?.description ?? "对象字段预览"}</span>
      </div>
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
        deleteKeyCode={["Backspace", "Delete"]}
        edgeTypes={edgeTypes}
        edges={edges}
        fitView
        nodeTypes={nodeTypes}
        nodes={nodes}
        onConnect={(connection) => void connectObjects(connection)}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgesDelete={(deletedEdges) => void deleteRelations(deletedEdges)}
        onEdgesChange={onEdgesChange}
        onNodeContextMenu={onNodeContextMenu}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={clearGuides}
        onNodesChange={onNodesChange}
        onPaneContextMenu={openPaneMenu}
        onSelectionChange={onSelectionChange}
        selectNodesOnDrag
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        snapGrid={snapGrid}
        snapToGrid={gridEnabled}
      >
        {gridEnabled ? (
          <Background gap={snapGrid} variant={gridVariant} />
        ) : null}
        <SmartGuidesOverlay guides={guides} />
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
