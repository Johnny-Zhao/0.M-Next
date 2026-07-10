import { useState, type ReactElement } from "react";

import { objectTypeLabel } from "../display-labels";
import { useToast } from "../toast";
import {
  createTechnicalObject,
  type CreateObjectKind,
} from "./create-object-form";
import {
  diagramPaletteItems,
  diagramToolRefreshDelayMs,
  nextConnectionMode,
  paletteObjectForm,
  type DiagramPaletteKind,
} from "./diagram-tool-model";
import { TreePanel } from "./tree-panel";
import {
  useWorkbenchContext,
  type LeftPaneMode,
  type WorkbenchContextValue,
} from "./workbench";

type DiagramToolsTab = "tree" | "palette";

export async function createDiagramToolObject(params: {
  readonly context: Pick<
    WorkbenchContextValue,
    "workspaceId" | "rootId" | "refreshViews"
  > & {
    readonly viewClient: Pick<
      WorkbenchContextValue["viewClient"],
      "objects" | "objectTypes" | "relationTypes"
    >;
    readonly commandClient: Pick<
      WorkbenchContextValue["commandClient"],
      "createObject" | "createRelation"
    >;
    readonly selection: Pick<WorkbenchContextValue["selection"], "select">;
  };
  readonly kind: DiagramPaletteKind;
  readonly scheduleRefresh?: (callback: () => void, delayMs: number) => void;
}): Promise<{
  readonly objectId: string | null;
  readonly kind: CreateObjectKind;
}> {
  const existingRequirements =
    params.kind === "requirement"
      ? (
          await params.context.viewClient.objects(
            params.context.workspaceId,
            "requirement",
            0,
            100,
          )
        ).items.length
      : 0;
  const result = await createTechnicalObject({
    viewClient: params.context.viewClient,
    commandClient: params.context.commandClient,
    workspaceId: params.context.workspaceId,
    rootId: params.context.rootId,
    form: paletteObjectForm(params.kind, existingRequirements),
  });
  params.context.refreshViews();
  (params.scheduleRefresh ?? window.setTimeout)(
    params.context.refreshViews,
    diagramToolRefreshDelayMs,
  );
  if (result.objectId) {
    params.context.selection.select({
      entityType: "object",
      entityId: result.objectId,
    });
  }
  return result;
}

export function DiagramToolsPanel(props: {
  readonly onBack: () => void;
  readonly setLeftPaneMode: (mode: LeftPaneMode) => void;
}): ReactElement {
  const context = useWorkbenchContext();
  const toast = useToast();
  const [tab, setTab] = useState<DiagramToolsTab>("tree");
  const [creating, setCreating] = useState<DiagramPaletteKind | null>(null);

  async function createPaletteItem(kind: DiagramPaletteKind): Promise<void> {
    setCreating(kind);
    try {
      const result = await createDiagramToolObject({ context, kind });
      toast.success(`${objectTypeLabel(result.kind)}已创建`);
    } catch (error) {
      context.reportError(
        error instanceof Error ? error.message : "新建图元失败",
      );
    } finally {
      setCreating(null);
    }
  }

  return (
    <aside className="diagram-tools-panel" aria-label="系统总图工具">
      <header>
        <button onClick={props.onBack} type="button">
          返回视图树
        </button>
        <strong>系统总图</strong>
      </header>
      <div className="diagram-tools-tabs" role="tablist">
        <button
          aria-selected={tab === "tree"}
          onClick={() => setTab("tree")}
          role="tab"
          type="button"
        >
          模型树
        </button>
        <button
          aria-selected={tab === "palette"}
          onClick={() => setTab("palette")}
          role="tab"
          type="button"
        >
          图元
        </button>
      </div>
      <div className="diagram-tools-content">
        {tab === "tree" ? (
          <TreePanel />
        ) : (
          <div className="diagram-palette" aria-label="图元">
            {diagramPaletteItems.map((item) => (
              <button
                disabled={creating !== null}
                key={item.kind}
                onClick={() => void createPaletteItem(item.kind)}
                type="button"
              >
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </button>
            ))}
            <button
              aria-pressed={context.connectionMode}
              className="diagram-palette-connect"
              onClick={() =>
                context.setConnectionMode((current) =>
                  nextConnectionMode(current, "toggle"),
                )
              }
              type="button"
            >
              <strong>连接</strong>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
