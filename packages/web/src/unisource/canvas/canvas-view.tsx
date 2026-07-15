import {
  Background,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnConnect,
  type OnNodeDrag,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { CanvasNodeConfig } from "../model/view-layer";
import { pushToast } from "../primitives";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import { workspaceStore, useWorkspaceSnapshot } from "../state/workspace-store";
import { AddNodePopover } from "./add-node-popover";
import {
  alignCanvasNodes,
  sizeCanvasNodes,
  type CanvasAlignCommand,
} from "./align";
import { AlignToolbar } from "./align-toolbar";
import { CanvasToolbar } from "./canvas-toolbar";
import {
  buildCanvasViewModel,
  canvasConfigWithNodes,
  deriveGotoTargets,
  parseCanvasConfig,
  screenToCanvasPosition,
} from "./canvas-view-model";
import { CanvasContextMenu } from "./context-menu";
import { DeleteObjectConfirmModal } from "./delete-confirm-modal";
import { EdgeLabeled } from "./edge-labeled";
import { NodeCard } from "./node-card";

const nodeTypes = { unisource: NodeCard };
const edgeTypes = { labeled: EdgeLabeled };

export function CanvasView({
  exprId,
  viewId,
}: {
  exprId: string;
  viewId: string;
}) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const selection = useSelectionSnapshot();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [menu, setMenu] = useState<{
    objectId: string;
    x: number;
    y: number;
  } | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const view = workspace.views.find(
    (candidate) => candidate.id === viewId && candidate.kind === "canvas",
  );
  const vm = view ? buildCanvasViewModel(workspace, view) : null;
  const selectedKey = selection.selected
    .filter((item) => item.entityType === "object")
    .map((item) => item.entityId)
    .join("|");
  const selectedIds = useMemo(
    () => new Set(selectedKey ? selectedKey.split("|") : []),
    [selectedKey],
  );
  const canEdit = sessionStore.can(session.currentMemberId, exprId, "editView");
  const reactNodes: Node[] = useMemo(
    () =>
      vm?.nodes.map((node) => ({
        id: node.objectId,
        type: "unisource",
        position: { x: node.x, y: node.y },
        width: node.w,
        height: node.h,
        data: { node },
        selected: selectedIds.has(node.objectId),
        draggable: canEdit,
      })) ?? [],
    [vm, selectedIds, canEdit],
  );
  const reactEdges: Edge[] = useMemo(() => {
    const edgeLabelVisibleBySource = new Map(
      vm?.nodes.map((node) => [node.objectId, node.visibility.edgeLabels]) ??
        [],
    );
    return (
      vm?.edges.map((edge) => ({
        id: edge.id,
        type: "labeled",
        source: edge.source,
        target: edge.target,
        data: {
          label: edge.label,
          showLabel: edgeLabelVisibleBySource.get(edge.source) !== false,
        },
      })) ?? []
    );
  }, [vm]);
  const selectedNodes =
    vm?.nodes.filter((node) => selectedIds.has(node.objectId)) ?? [];
  const deleteTarget =
    deleteTargetId === null
      ? null
      : (workspace.objects.find((object) => object.id === deleteTargetId) ??
        null);
  const deleteTargetName = String(
    deleteTarget?.fields.name?.value ?? deleteTarget?.id ?? "",
  );

  if (!view || !vm) {
    return (
      <div className="us-canvas-empty">
        <h2>未找到画布视图</h2>
        <p>当前表达尚未配置 canvas form。</p>
      </div>
    );
  }

  const writeNodes = (nodes: readonly CanvasNodeConfig[], summary: string) => {
    workspaceStore.updateViewConfig(
      view.id,
      canvasConfigWithNodes(view, nodes),
      { actor: session.currentMemberId, summary },
    );
  };

  const patchSelectedNodes = (
    objectIds: readonly string[],
    patch: (node: CanvasNodeConfig) => CanvasNodeConfig,
    summary: string,
  ) => {
    const targets = new Set(objectIds);
    const nodes = parseCanvasConfig(view).nodes.map((node) =>
      targets.has(node.objectId) ? patch(node) : node,
    );
    writeNodes(nodes, summary);
  };

  const removeFromView = (objectIds: readonly string[]) => {
    const targets = new Set(objectIds);
    const nodes = parseCanvasConfig(view).nodes.filter(
      (node) => !targets.has(node.objectId),
    );
    writeNodes(nodes, `从视图移除 ${targets.size} 个卡片`);
    selectionStore.clear();
  };

  const onNodeClick: NodeMouseHandler = (event, node) => {
    setMenu(null);
    const ref = { entityType: "object" as const, entityId: node.id };
    if (event.shiftKey || event.metaKey || event.ctrlKey)
      selectionStore.toggle(ref);
    else selectionStore.set(ref);
  };

  const onNodeContextMenu: NodeMouseHandler = (event, node) => {
    event.preventDefault();
    selectionStore.set({ entityType: "object", entityId: node.id });
    setMenu({ objectId: node.id, x: event.clientX, y: event.clientY });
  };

  const onSelectionChange = ({ nodes }: OnSelectionChangeParams) => {
    if (nodes.length === 0) return;
    selectionStore.set({ entityType: "object", entityId: nodes[0].id });
    for (const node of nodes.slice(1)) {
      selectionStore.add({ entityType: "object", entityId: node.id });
    }
  };

  const onNodeDragStop: OnNodeDrag = (_event, node) => {
    if (!canEdit) return;
    patchSelectedNodes(
      [node.id],
      (config) => ({
        ...config,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      }),
      "移动画布卡片",
    );
  };

  const onConnect: OnConnect = (connection) => {
    connectObjects(connection);
  };

  const connectObjects = (connection: Connection) => {
    if (!connectMode) {
      pushToast({ title: "请先进入连线模式" });
      return;
    }
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) {
      pushToast({ title: "不能连接同一张卡片" });
      return;
    }
    if (
      workspace.relations.some(
        (relation) =>
          relation.status === "active" &&
          relation.sourceId === connection.source &&
          relation.targetId === connection.target,
      )
    ) {
      pushToast({ title: "这条关系已存在" });
      return;
    }
    const result = workspaceStore.createRelation({
      relationTypeCode: "interconnects_with",
      sourceId: connection.source,
      targetId: connection.target,
      actor: session.currentMemberId,
      summary: "画布连线创建关系",
    });
    const config = parseCanvasConfig(view);
    workspaceStore.updateViewConfig(
      view.id,
      {
        ...view.config,
        edges: [...config.edges, { relationId: result.relation.id }],
      },
      { actor: session.currentMemberId, summary: "显示新建关系" },
    );
    pushToast({ title: "关系已创建" });
  };

  const addObjectToCanvas = (
    objectId: string,
    position?: { readonly x: number; readonly y: number },
  ) => {
    const config = parseCanvasConfig(view);
    if (config.nodes.some((node) => node.objectId === objectId)) return;
    const object = workspace.objects.find((item) => item.id === objectId);
    const objectType = workspace.objectTypes.find(
      (type) => type.code === object?.objectTypeCode,
    );
    const fallback = {
      x: 140 + config.nodes.length * 42,
      y: 120 + config.nodes.length * 34,
    };
    writeNodes(
      [
        ...config.nodes,
        {
          objectId,
          x: Math.round(position?.x ?? fallback.x),
          y: Math.round(position?.y ?? fallback.y),
          w: 210,
          h: 124,
          shownFields: objectType?.fields
            .slice(0, 2)
            .map((field) => field.code),
        },
      ],
      `添加卡片 ${objectId}`,
    );
    setAddOpen(false);
    selectionStore.set({ entityType: "object", entityId: objectId });
  };

  const addDroppedObject = (event: DragEvent<HTMLDivElement>) => {
    const objectId =
      event.dataTransfer.getData("application/x-unisource-object") ||
      event.dataTransfer.getData("text/plain");
    if (!objectId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const fallback = screenToCanvasPosition(event.clientX, event.clientY, rect);
    const position =
      flowRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? fallback;
    addObjectToCanvas(objectId, position);
    setDraggingObjectId(null);
  };

  const runSimulation = () => {
    const next = new URLSearchParams(search);
    next.set("run", "1");
    setSearch(next);
  };

  const handleAlign = (command: CanvasAlignCommand) => {
    const config = parseCanvasConfig(view);
    writeNodes(
      alignCanvasNodes(config.nodes, selectedIds, command),
      `画布对齐 ${command}`,
    );
  };

  const handleSize = (command: "sameWidth" | "sameHeight" | "sameSize") => {
    const config = parseCanvasConfig(view);
    writeNodes(
      sizeCanvasNodes(config.nodes, selectedIds, command),
      `画布等尺寸 ${command}`,
    );
  };

  const confirmDelete = () => {
    if (!deleteTargetId) return;
    workspaceStore.deleteObject(deleteTargetId, session.currentMemberId);
    selectionStore.clear();
    setDeleteTargetId(null);
  };

  return (
    <div className="us-canvas-shell">
      <div className="us-canvas-topbar">
        <CanvasToolbar
          addOpen={addOpen}
          canEdit={canEdit}
          connectMode={connectMode}
          onAdd={() => setAddOpen((current) => !current)}
          onRun={runSimulation}
          onSelect={() => setConnectMode(false)}
          onToggleConnect={() => setConnectMode((current) => !current)}
        />
        {connectMode ? (
          <span className="us-canvas-hint">
            连线模式：从卡片右侧拖到另一张卡片
          </span>
        ) : null}
        {vm.danglingRefs.length > 0 ? (
          <span className="us-canvas-hint" role="status">
            {Array.from(
              new Set(vm.danglingRefs.map((ref) => ref.message)),
            ).join(" · ")}
          </span>
        ) : null}
        {addOpen ? (
          <AddNodePopover
            objects={workspace.objects}
            objectTypes={workspace.objectTypes}
            existingObjectIds={vm.nodes.map((node) => node.objectId)}
            onAdd={addObjectToCanvas}
            onClose={() => setAddOpen(false)}
            onDragAdd={setDraggingObjectId}
          />
        ) : null}
      </div>
      <div
        className="us-canvas-stage"
        data-dragging-add={draggingObjectId !== null || undefined}
        onDragLeave={() => setDraggingObjectId(null)}
        onDragOver={(event) => {
          if (
            !Array.from(event.dataTransfer.types).includes(
              "application/x-unisource-object",
            )
          )
            return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={addDroppedObject}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setConnectMode(false);
            setMenu(null);
          }
        }}
      >
        <ReactFlow
          nodes={reactNodes}
          edges={reactEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesConnectable
          nodesDraggable={canEdit}
          multiSelectionKeyCode={["Meta", "Control", "Shift"]}
          onConnect={onConnect}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => {
            selectionStore.clear();
            setMenu(null);
          }}
          onSelectionChange={onSelectionChange}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--us-border-soft)" gap={24} />
        </ReactFlow>
        <AlignToolbar
          canEdit={canEdit}
          count={selectedNodes.length}
          onAlign={handleAlign}
          onSize={handleSize}
          onRemove={() =>
            removeFromView(selectedNodes.map((node) => node.objectId))
          }
        />
        {menu ? (
          <CanvasContextMenu
            x={menu.x}
            y={menu.y}
            canEdit={canEdit}
            gotoTargets={deriveGotoTargets(workspace, menu.objectId)}
            onGoto={(target) => navigate(target.href)}
            onRemove={() => removeFromView([menu.objectId])}
            onDelete={() => setDeleteTargetId(menu.objectId)}
            onClose={() => setMenu(null)}
          />
        ) : null}
      </div>
      <DeleteObjectConfirmModal
        open={deleteTarget !== null}
        objectName={deleteTargetName}
        impact={`将影响 ${workspace.relations.filter((relation) => relation.sourceId === deleteTargetId || relation.targetId === deleteTargetId).length} 条关系、${workspace.fieldRefs.filter((ref) => ref.objectId === deleteTargetId).length} 处引用。`}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function patchCanvasNodes(
  viewNodes: readonly CanvasNodeConfig[],
  objectIds: ReadonlySet<string>,
  patch: (node: CanvasNodeConfig) => CanvasNodeConfig,
): readonly CanvasNodeConfig[] {
  return viewNodes.map((node) =>
    objectIds.has(node.objectId) ? patch(node) : node,
  );
}
