import { useParams, useSearchParams } from "react-router-dom";

import { BiBoard } from "../bi/bi-board";
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
import type { CanvasNodeConfig } from "../model/view-layer";
import { UsMonoTag } from "../primitives";
import { parseFormParam } from "../routes-paths";
import { FormRow, nextFormSearch } from "../shell/form-row";
import { LayoutToggle, nextLayoutSearch } from "../shell/layout-toggle";
import { UsInspector } from "../shell/inspector";
import { WorkspaceLayout } from "../shell/layouts";
import { SplitView } from "../split/split-view";
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
  const runOpen = search.get("run") === "1";
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

  const inspector = chatOpen ? (
    <ChatPanel
      onClose={() => {
        const next = new URLSearchParams(search);
        next.delete("drawer");
        setSearch(next);
      }}
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
        sync: {
          state:
            form === "doc" && docVm
              ? docVm.howState
              : syncedRefs > 0
                ? "change"
                : "ok",
          label:
            form === "doc" && docVm
              ? docVm.howLabel
              : syncedRefs > 0
                ? `刚刚同步 ${syncedRefs} 处引用`
                : (expr?.lastActivity ?? "已同步"),
        },
        people,
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
      ) : form === "canvas" && expr && isTemplateCanvas && !runOpen ? (
        <TemplateCanvas exprId={expr.id} />
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
