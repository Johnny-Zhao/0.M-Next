import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { BiBoard } from "../bi/bi-board";
import { AnaView } from "../ana/ana-view";
import { CanvasView } from "../canvas/canvas-view";
import {
  canvasConfigWithNodes,
  parseCanvasConfig,
} from "../canvas/canvas-view-model";
import { CanvasPropsPanel } from "../canvas/inspector-props-panel";
import { CanvasStylePanel } from "../canvas/inspector-style-panel";
import { CanvasVersionsPanel } from "../canvas/inspector-versions-panel";
import { ChatPanel } from "../chat/chat-panel";
import { DocView } from "../doc/doc-view";
import { buildDocViewModel } from "../doc/doc-view-model";
import { LineageDrawer } from "../lineage/lineage-drawer";
import { MatrixBoard } from "../matrix/matrix-board";
import type { CanvasNodeConfig } from "../model/view-layer";
import { UsMonoTag } from "../primitives";
import { AnnotationDrawer } from "../review/annotation-drawer";
import { parseFormParam } from "../routes-paths";
import { FormRow, nextFormSearch } from "../shell/form-row";
import { LayoutToggle, nextLayoutSearch } from "../shell/layout-toggle";
import { UsInspector } from "../shell/inspector";
import { WorkspaceLayout } from "../shell/layouts";
import { SplitView } from "../split/split-view";
import { advancePlayhead } from "../sim/sim-playback";
import { SimParamsPanel } from "../sim/sim-params-panel";
import { SimView } from "../sim/sim-view";
import { deriveSimTimeline, type SimNetwork } from "../sim/sim-timing";
import { useSelectionSnapshot } from "../state/selection-store";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import { workspaceStore, useWorkspaceSnapshot } from "../state/workspace-store";
import { TemplateCanvas } from "../template/template-canvas";
import { TemplateConfigDoc } from "../template/template-config-doc";
import { PageSkeleton } from "./page-skeleton";

const FORM_LABEL: Record<string, string> = {
  grid: "表格",
  doc: "文档",
  canvas: "视图",
  matrix: "矩阵",
  bi: "BI 看板",
  ana: "分析",
};

/**
 * 表达页宿主:/expr/:exprId?form=…(doc/split/canvas/matrix/bi/ana 的挂载点)。
 * P0:读取 form 参数展示占位;form=canvas 时挂 Inspector 容器(属性/样式/版本)。
 */
export function ExprPage() {
  const { exprId } = useParams<{ exprId: string }>();
  const [search, setSearch] = useSearchParams();
  const snapshot = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const selection = useSelectionSnapshot();
  const expr = snapshot.expressions.find(
    (candidate) => candidate.id === exprId,
  );
  const form = parseFormParam(search, expr?.defaultForm ?? "doc");
  const split = search.get("layout") === "split";
  const chatOpen = search.get("drawer") === "chat";
  const reviewOpen = search.get("drawer") === "review";
  const lineageOpen = search.get("drawer") === "lineage";
  const runOpen = search.get("run") === "1";
  const [simNetwork, setSimNetwork] = useState<SimNetwork>("normal");
  const [simPlayhead, setSimPlayhead] = useState(0);
  const [simPlaying, setSimPlaying] = useState(true);
  const [simSpeed, setSimSpeed] = useState<1 | 2>(1);
  const [simLoop, setSimLoop] = useState(true);
  const forms = Array.from(
    new Set(
      expr?.viewIds
        .map(
          (viewId) => snapshot.views.find((view) => view.id === viewId)?.kind,
        )
        .filter((value): value is NonNullable<typeof value> =>
          Boolean(value),
        ) ?? ["doc"],
    ),
  );
  const people = snapshot.members.slice(0, 2).map((member) => ({
    member: member.avatar,
    label: member.name.slice(0, 1),
    title: member.name,
  }));
  const canSplit = forms.includes("doc") && forms.includes("grid");
  const syncedRefs =
    exprId === undefined
      ? 0
      : snapshot.fieldRefs.filter(
          (ref) => ref.exprId === exprId && ref.state === "justSynced",
        ).length;
  const inventoryDocRefs = new Set(
    snapshot.fieldRefs
      .filter((ref) =>
        snapshot.objects.some(
          (object) =>
            object.id === ref.objectId &&
            object.objectTypeCode === "product_specs",
        ),
      )
      .map((ref) => ref.exprId),
  ).size;
  const docModel =
    exprId === undefined
      ? undefined
      : snapshot.docModels.find((candidate) => candidate.exprId === exprId);
  const docVm = docModel ? buildDocViewModel(snapshot, docModel) : null;
  const canvasView =
    exprId === undefined
      ? undefined
      : snapshot.views.find(
          (candidate) =>
            candidate.exprId === exprId && candidate.kind === "canvas",
        );
  const isTemplateCanvas = Boolean(canvasView?.config.templateId);
  const isSimulationOpen = form === "canvas" && runOpen && !isTemplateCanvas;
  const simScenario = snapshot.simScenarios[0] ?? null;
  const simTimeline = useMemo(
    () =>
      simScenario ? deriveSimTimeline(simScenario, snapshot, simNetwork) : null,
    [simScenario, snapshot, simNetwork],
  );
  const isTemplateConfigDoc =
    form === "doc" &&
    snapshot.views.some(
      (view) =>
        view.exprId === exprId &&
        view.kind === "doc" &&
        typeof view.config.sourceExprId === "string",
    );
  const canvasCanEdit =
    exprId !== undefined &&
    sessionStore.can(session.currentMemberId, exprId, "editView");
  const selectedObjectCount = selection.selected.filter(
    (item) => item.entityType === "object",
  ).length;
  const annotationTarget = selection.current ?? selection.selected[0] ?? null;
  const lineageTarget =
    selection.current?.entityType === "field"
      ? selection.current
      : (selection.selected.find((item) => item.entityType === "field") ??
        null);

  const closeDrawer = () => {
    const next = new URLSearchParams(search);
    next.delete("drawer");
    setSearch(next);
  };

  const openReviewDrawer = () => {
    const next = new URLSearchParams(search);
    next.set("drawer", "review");
    setSearch(next);
  };

  const openLineageDrawer = () => {
    const next = new URLSearchParams(search);
    next.set("drawer", "lineage");
    setSearch(next);
  };

  useEffect(() => {
    if (!isSimulationOpen) {
      setSimPlaying(false);
      return;
    }
    setSimPlayhead(0);
    setSimPlaying(true);
  }, [exprId, isSimulationOpen]);

  useEffect(() => {
    if (!isSimulationOpen || !simPlaying || !simTimeline) return undefined;
    const timer = window.setInterval(() => {
      setSimPlayhead((current) => {
        const next = advancePlayhead(
          current,
          0.1,
          simSpeed,
          simTimeline.duration,
          simLoop,
        );
        if (!simLoop && next >= simTimeline.duration) setSimPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [isSimulationOpen, simLoop, simPlaying, simSpeed, simTimeline]);

  const changeSimNetwork = (network: SimNetwork) => {
    setSimNetwork(network);
    setSimPlayhead(0);
    setSimPlaying(true);
  };

  const stopSimulation = () => {
    const next = new URLSearchParams(search);
    next.delete("run");
    setSearch(next);
  };

  const patchCanvasNodes = (
    objectIds: readonly string[],
    patch: (node: CanvasNodeConfig) => CanvasNodeConfig,
    summary: string,
  ) => {
    if (!canvasView) return;
    const targets = new Set(objectIds);
    const nodes = parseCanvasConfig(canvasView).nodes.map((node) =>
      targets.has(node.objectId) ? patch(node) : node,
    );
    workspaceStore.updateViewConfig(
      canvasView.id,
      canvasConfigWithNodes(canvasView, nodes),
      { actor: session.currentMemberId, summary },
    );
  };

  const removeCanvasNodes = (objectIds: readonly string[]) => {
    if (!canvasView) return;
    const targets = new Set(objectIds);
    workspaceStore.updateViewConfig(
      canvasView.id,
      canvasConfigWithNodes(
        canvasView,
        parseCanvasConfig(canvasView).nodes.filter(
          (node) => !targets.has(node.objectId),
        ),
      ),
      { actor: session.currentMemberId, summary: "从画布移除卡片" },
    );
  };

  const inspector = reviewOpen ? (
    <AnnotationDrawer
      open={reviewOpen}
      onClose={closeDrawer}
      target={annotationTarget}
    />
  ) : lineageOpen ? (
    <LineageDrawer
      open={lineageOpen}
      onClose={closeDrawer}
      target={lineageTarget}
    />
  ) : chatOpen ? (
    <ChatPanel onClose={closeDrawer} />
  ) : isSimulationOpen && simTimeline && simScenario ? (
    <SimParamsPanel
      network={simNetwork}
      onNetworkChange={changeSimNetwork}
      playhead={simPlayhead}
      scenarioName={simScenario.name}
      timeline={simTimeline}
    />
  ) : form === "canvas" && !isTemplateCanvas ? (
    <UsInspector
      aside={<span className="us-data">已选 {selectedObjectCount}</span>}
      tabs={[
        {
          key: "props",
          label: "属性",
          content: (
            <CanvasPropsPanel
              exprId={exprId ?? ""}
              canEdit={canvasCanEdit}
              onRemove={removeCanvasNodes}
              onDelete={(objectId) =>
                workspaceStore.deleteObject(objectId, session.currentMemberId)
              }
            />
          ),
        },
        {
          key: "style",
          label: "样式",
          content: (
            <CanvasStylePanel
              exprId={exprId ?? ""}
              canEdit={canvasCanEdit}
              onPatchNodes={patchCanvasNodes}
            />
          ),
        },
        {
          key: "versions",
          label: "版本",
          content: <CanvasVersionsPanel exprId={exprId ?? ""} />,
        },
      ]}
    />
  ) : undefined;

  return (
    <WorkspaceLayout
      chrome={{
        breadcrumb: [
          { label: "表达" },
          { label: expr?.name ?? exprId ?? "未知表达" },
        ],
        breadcrumbTail:
          isSimulationOpen && simScenario ? (
            <span className="us-sim-breadcrumb">
              回放中 · 场景「{simScenario.name.split(" · ")[0]}」
            </span>
          ) : undefined,
        sync: {
          state: isSimulationOpen
            ? "change"
            : form === "doc" && docVm
              ? docVm.howState
              : syncedRefs > 0
                ? "change"
                : "ok",
          label: isSimulationOpen
            ? "仿真 · 运行中"
            : form === "matrix" && exprId === "exp-inventory"
              ? `已同步 · ${inventoryDocRefs} 篇关联文档`
              : form === "doc" && docVm
                ? docVm.howLabel
                : syncedRefs > 0
                  ? `刚刚同步 ${syncedRefs} 处引用`
                  : (expr?.lastActivity ?? "已同步"),
        },
        people,
        actions: (
          <>
            <button
              aria-pressed={lineageOpen}
              className="us-topbar__review us-topbar__lineage"
              onClick={openLineageDrawer}
              title="打开字段血缘"
              type="button"
            >
              血缘
            </button>
            <button
              aria-pressed={reviewOpen}
              className="us-topbar__review"
              onClick={openReviewDrawer}
              title="打开评审批注"
              type="button"
            >
              评审
            </button>
          </>
        ),
        aiHref: `/expr/${expr?.id ?? exprId}?form=${form}&drawer=chat`,
      }}
      inspector={inspector}
      subHeader={
        <FormRow
          activeForm={form}
          forms={forms}
          onFormChange={(next) =>
            setSearch(nextFormSearch(search.toString(), next))
          }
        >
          {isSimulationOpen ? (
            <UsMonoTag active tone="change">
              仿真 · 运行中
            </UsMonoTag>
          ) : null}
          {canSplit && form === "doc" ? (
            <LayoutToggle
              onToggle={(next) =>
                setSearch(nextLayoutSearch(search.toString(), next))
              }
              split={split}
            />
          ) : null}
        </FormRow>
      }
    >
      {form === "doc" && split && expr ? (
        <SplitView exprId={expr.id} />
      ) : form === "doc" && expr && isTemplateConfigDoc ? (
        <TemplateConfigDoc exprId={expr.id} />
      ) : form === "doc" && expr ? (
        <DocView exprId={expr.id} />
      ) : form === "bi" && expr ? (
        <BiBoard />
      ) : form === "matrix" && expr ? (
        <MatrixBoard exprId={expr.id} />
      ) : form === "ana" && expr ? (
        <AnaView exprId={expr.id} />
      ) : form === "canvas" && expr && isTemplateCanvas && !runOpen ? (
        <TemplateCanvas exprId={expr.id} />
      ) : form === "canvas" && expr && isSimulationOpen && simTimeline ? (
        <SimView
          exprId={expr.id}
          loop={simLoop}
          onLoopChange={setSimLoop}
          onPlayingChange={setSimPlaying}
          onSpeedChange={setSimSpeed}
          onStop={stopSimulation}
          playing={simPlaying}
          playhead={simPlayhead}
          speed={simSpeed}
          timeline={simTimeline}
        />
      ) : form === "canvas" && expr && !runOpen ? (
        <CanvasView exprId={expr.id} />
      ) : form === "canvas" && runOpen ? (
        <PageSkeleton
          kicker="SIMULATION"
          title="运行预览"
          desc="P2 画布批只接入运行入口占位，正式仿真宿主留给后续批次。"
        />
      ) : (
        <PageSkeleton
          kicker={`EXPR · form=${form}`}
          title={
            <>
              {expr?.name ?? "未知表达"}{" "}
              <UsMonoTag active>{FORM_LABEL[form] ?? form}</UsMonoTag>
            </>
          }
          desc="P1/P2 实现:HOW 形式行与各描述形式主区(文档/分屏/画布/矩阵/BI/分析);URL form= 与界面状态双向同步(本页已生效)。"
        />
      )}
    </WorkspaceLayout>
  );
}
