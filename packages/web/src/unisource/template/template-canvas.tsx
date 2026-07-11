import {
  Background,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { UsButton, UsMonoTag, pushToast } from "../primitives";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import type { WorkspaceState } from "../state/workspace-store";
import { workspaceStore, useWorkspaceSnapshot } from "../state/workspace-store";
import { useValidationSnapshot } from "../state/validation-store";
import { LibraryPanel } from "./library-panel";
import { SlotCard } from "./slot-card";
import { TemplateEdge } from "./template-edge";
import {
  buildTemplateViewModel,
  deriveConfigDocAvailability,
  matchSlotConstraints,
  parseTemplateSlotNodes,
  type LibraryItemVm,
} from "./template-view-model";

const nodeTypes = { slot: SlotCard };
const edgeTypes = { template: TemplateEdge };

export function resolveTemplateConfigDocHref(
  workspace: WorkspaceState,
  sourceExprId: string,
  templateId: string,
): string {
  const sourceExpr = workspace.expressions.find(
    (candidate) => candidate.id === sourceExprId,
  );
  const targetView = workspace.views.find(
    (view) =>
      view.kind === "doc" &&
      view.config.sourceExprId === sourceExprId &&
      view.config.templateId === templateId,
  );
  const fallbackView = workspace.views.find((view) => {
    if (view.kind !== "doc" || view.config.templateId !== templateId)
      return false;
    const expr = workspace.expressions.find(
      (candidate) => candidate.id === view.exprId,
    );
    return expr?.space === sourceExpr?.space;
  });
  return `/expr/${targetView?.exprId ?? fallbackView?.exprId ?? sourceExprId}?form=doc`;
}

export function TemplateCanvas({ exprId }: { exprId: string }) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const validation = useValidationSnapshot();
  const navigate = useNavigate();
  const view = workspace.views.find(
    (candidate) => candidate.exprId === exprId && candidate.kind === "canvas",
  );
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const vm = useMemo(
    () => (view ? buildTemplateViewModel(workspace, view, activeSlotId) : null),
    [workspace, view, activeSlotId],
  );
  const canEdit = sessionStore.can(session.currentMemberId, exprId, "editView");
  const activeSlot =
    vm?.slots.find((slot) => slot.state === "activated") ??
    vm?.slots.find((slot) => slot.slotId === activeSlotId) ??
    vm?.slots.find((slot) => slot.objectId === null) ??
    vm?.slots[0] ??
    null;
  const availability = deriveConfigDocAvailability({
    pendingCount: vm?.pendingCount ?? 0,
    errorCount: validation.results.filter((result) => result.level === "error")
      .length,
    canEdit,
  });
  const nodes: Node[] =
    vm?.slots.map((slot) => ({
      id: slot.slotId,
      type: "slot",
      position: { x: slot.x, y: slot.y },
      width: slot.w,
      height: slot.h,
      data: { slot },
      selected: slot.slotId === activeSlot?.slotId,
      draggable: canEdit,
    })) ?? [];
  const edges: Edge[] =
    vm?.edges.map((edge) => ({
      id: edge.id,
      type: "template",
      source: edge.source,
      target: edge.target,
      data: { label: edge.label, solid: edge.solid },
    })) ?? [];

  if (!view || !vm) return null;

  const bindObject = (item: LibraryItemVm) => {
    if (!canEdit || !activeSlot) return;
    const object = workspace.objects.find(
      (candidate) => candidate.id === item.objectId,
    );
    const template = workspace.sceneTemplates.find(
      (candidate) => candidate.id === vm.templateId,
    );
    const slot = template?.slots.find(
      (candidate) => candidate.id === activeSlot.slotId,
    );
    if (!object || !slot) return;
    const match = matchSlotConstraints(object, slot);
    if (!match.ok) {
      pushToast({ title: "不符合槽位约束", desc: match.reason });
      return;
    }
    workspaceStore.bindSlot(
      { bindingId: activeSlot.bindingId },
      item.objectId,
      {
        actor: session.currentMemberId,
        summary: `实例化槽位 ${slot.label} → ${item.name}`,
      },
    );
    pushToast({ title: "槽位已实例化", desc: item.name });
  };

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    setActiveSlotId(node.id);
  };

  const onNodeDragStop: OnNodeDrag = (_event, node) => {
    if (!canEdit) return;
    const current = parseTemplateSlotNodes(
      view,
      workspace.sceneTemplates.find((item) => item.id === vm.templateId)
        ?.slots ?? [],
    );
    const next = current.map((slot) =>
      slot.slotId === node.id
        ? {
            ...slot,
            x: Math.round(node.position.x),
            y: Math.round(node.position.y),
          }
        : slot,
    );
    workspaceStore.updateViewConfig(
      view.id,
      { ...view.config, slotNodes: next },
      { actor: session.currentMemberId, summary: "移动模板槽位" },
    );
  };

  return (
    <section className="us-template-shell">
      <main className="us-template-main">
        <div className="us-template-toolbar">
          <UsMonoTag active>{vm.templateName}</UsMonoTag>
          <span className="us-template-pending" data-ok={vm.pendingCount === 0}>
            {vm.pendingCount === 0
              ? "槽位已全部实例化"
              : `${vm.pendingCount}/${vm.totalCount} 槽位待实例化`}
          </span>
          <span className="us-template-toolbar__spacer" />
          <UsButton
            size="sm"
            variant="secondary"
            onClick={() => pushToast({ title: "添加槽位是后续能力占位" })}
          >
            添加槽位
          </UsButton>
          <UsButton
            size="sm"
            variant="secondary"
            onClick={() => pushToast({ title: "另存为模板是后续能力占位" })}
          >
            另存为模板
          </UsButton>
          <UsButton
            size="sm"
            variant="emphasis"
            disabled={!availability.enabled}
            title={availability.reason}
            onClick={() => {
              pushToast({ title: "正在打开配置单" });
              navigate(
                resolveTemplateConfigDocHref(workspace, exprId, vm.templateId),
              );
            }}
          >
            生成配置单 DOC
          </UsButton>
        </div>
        <div
          className="us-template-stage"
          data-dragging={draggingId !== null}
          onDragOver={(event) => {
            if (canEdit) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const objectId = event.dataTransfer.getData("text/plain");
            const item = vm.library.items.find(
              (candidate) => candidate.objectId === objectId,
            );
            if (item) bindObject(item);
            setDraggingId(null);
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            nodesDraggable={canEdit}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
          >
            <Background color="var(--us-border-soft)" gap={24} />
          </ReactFlow>
          <div className="us-template-hint">
            <UsMonoTag>LIVE</UsMonoTag>
            模板只保存抽象槽位；拖入库记录后，字段随硬件产品库更新。
          </div>
        </div>
      </main>
      <LibraryPanel
        canEdit={canEdit}
        draggingId={draggingId}
        library={vm.library}
        onBind={bindObject}
        onDragEnd={() => setDraggingId(null)}
        onDragStart={setDraggingId}
      />
    </section>
  );
}
