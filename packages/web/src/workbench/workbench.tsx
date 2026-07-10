import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview";
import {
  createContext,
  type Dispatch,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type SetStateAction,
} from "react";

import {
  CommandClient,
  SelectionCoordinator,
  ViewClient,
  type OutputFormat,
  type SelectionRef,
} from "@m-next/views";

import { AiPanel } from "./ai-panel";
import { AssemblyCatalogPanel } from "./assembly-catalog-panel";
import { CommandPalette, isCommandPaletteShortcut } from "./command-palette";
import type {
  CommandContext,
  CommandPanelId,
  CommandRegistry,
} from "./commands";
import { CreateObjectForm } from "./create-object-form";
import { DiagramPanel } from "./diagram-panel";
import { DiagramToolsPanel } from "./diagram-tools-panel";
import {
  DocumentOutputAction,
  downloadOutput,
  generateDocumentOutput,
} from "./document-output-action";
import { DocumentPanel } from "./document-panel";
import { ExchangePanel } from "./exchange-panel";
import { FloorplanPanel } from "./floorplan-panel";
import { InspectorPanel } from "./inspector-panel";
import { MappingPanel } from "./mapping-panel";
import { MatrixPanel } from "./matrix-panel";
import { ProposalSummaryBar } from "./proposal-summary-bar";
import { ReviewPanel } from "./review-panel";
import { runSaveAutoCheck } from "./save-auto-check";
import { WorkbenchShellChrome } from "./shell-chrome";
import { SnapshotPanel } from "./snapshot-panel";
import { TablePanel } from "./table-panel";
import { TreePanel } from "./tree-panel";
import { ValidatePanel } from "./validate-panel";
import { ValidationDrawer } from "./validation-drawer";
import { VerificationDashboardPanel } from "./verification-dashboard-panel";
import { ViewTreePanel } from "./view-tree-panel";
import { nextConnectionMode } from "./diagram-tool-model";

export type WorkbenchPanelId =
  | "diagram"
  | "floorplan"
  | "table"
  | "matrix"
  | "mapping"
  | "document"
  | "tree"
  | "inspector"
  | "validate"
  | "verification"
  | "ai"
  | "review"
  | "assembly"
  | "exchange"
  | "snapshot";

export type LeftPaneMode = "view-tree" | "diagram-tools";

export interface WorkbenchPanelDefinition {
  readonly id: WorkbenchPanelId;
  readonly title: string;
  readonly component: WorkbenchPanelId;
}

export const workbenchPanelDefinitions: readonly WorkbenchPanelDefinition[] = [
  { id: "diagram", title: "图", component: "diagram" },
  { id: "floorplan", title: "平面图", component: "floorplan" },
  { id: "table", title: "表格", component: "table" },
  { id: "matrix", title: "矩阵", component: "matrix" },
  { id: "mapping", title: "映射", component: "mapping" },
  { id: "document", title: "文档", component: "document" },
  { id: "tree", title: "模型树", component: "tree" },
  { id: "inspector", title: "属性/校验", component: "inspector" },
  { id: "validate", title: "校验", component: "validate" },
  { id: "verification", title: "验证仪表", component: "verification" },
  { id: "ai", title: "AI 助手", component: "ai" },
  { id: "review", title: "批注", component: "review" },
  { id: "assembly", title: "装配目录", component: "assembly" },
  { id: "exchange", title: "交换", component: "exchange" },
  { id: "snapshot", title: "快照", component: "snapshot" },
];

export interface WorkbenchContextValue {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly templateCode?: string | null;
  readonly objectType: string;
  readonly relationType: string;
  readonly rootId: string;
  readonly refreshVersion: number;
  readonly connectionMode: boolean;
  readonly viewClient: ViewClient;
  readonly commandClient: CommandClient;
  readonly selection: SelectionCoordinator;
  readonly setObjectType: (value: string) => void;
  readonly setRelationType: (value: string) => void;
  readonly setRootId: (value: string) => void;
  readonly refreshViews: () => void;
  readonly setConnectionMode: Dispatch<SetStateAction<boolean>>;
  readonly autoCheckAfterSave: () => Promise<void>;
  readonly reportError: (message: string) => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbenchContext(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error("Workbench context is missing");
  return context;
}

export function ensureWorkbenchPanels(
  api: DockviewApi,
  templateCode?: string | null,
): void {
  if (api.panels.length > 0) return;
  const byId = (id: WorkbenchPanelId): WorkbenchPanelDefinition =>
    workbenchPanelDefinitions.find((panel) => panel.id === id) ??
    workbenchPanelDefinitions[0];
  api.addPanel(byId("diagram"));
  if (templateCode === "technical_proposal") {
    api.addPanel({
      ...byId("inspector"),
      inactive: true,
      initialWidth: 320,
      position: { direction: "right", referencePanel: "diagram" },
    });
    return;
  }
  // 平面图 / 表格 / 矩阵 / 文档 与「图」同组,呈现为视图切换标签页
  api.addPanel({ ...byId("floorplan"), inactive: true });
  api.addPanel({ ...byId("table"), inactive: true });
  api.addPanel({ ...byId("matrix"), inactive: true });
  api.addPanel({ ...byId("mapping"), inactive: true });
  api.addPanel({ ...byId("document"), inactive: true });
  api.addPanel({
    ...byId("tree"),
    inactive: true,
    initialWidth: 260,
    position: { direction: "left", referencePanel: "diagram" },
  });
  api.addPanel({
    ...byId("inspector"),
    inactive: true,
    initialWidth: 320,
    position: { direction: "right", referencePanel: "diagram" },
  });
  api.addPanel({
    ...byId("validate"),
    inactive: true,
    initialHeight: 200,
    position: { direction: "below", referencePanel: "diagram" },
  });
}

export function openWorkbenchPanel(
  api: DockviewApi,
  panelId: WorkbenchPanelId,
  options: { readonly focus?: boolean } = {},
): void {
  // focus:false 表示「因选择而被动揭示」某面板,只激活、不移动 DOM 焦点。
  // 若此处抢焦点,会把用户刚点进去的输入框(如字段总表内联编辑器)blur 掉,导致打不进字。
  const shouldFocus = options.focus ?? true;
  const existing = api.getPanel(panelId);
  if (existing) {
    existing.api.setActive();
    if (shouldFocus) api.focus();
    return;
  }
  const definition = workbenchPanelDefinitions.find(
    (panel) => panel.id === panelId,
  );
  if (!definition) return;
  const panel = api.addPanel(definition);
  panel.api.setActive();
  if (shouldFocus) api.focus();
}

export function shouldOpenInspectorForSelection(
  selection: SelectionRef | null,
): boolean {
  return (
    selection?.entityType === "object" || selection?.entityType === "field"
  );
}

export function leftPaneModeForPanel(panelId: WorkbenchPanelId): LeftPaneMode {
  return panelId === "diagram" ? "diagram-tools" : "view-tree";
}

export function isPrimaryView(panelId: WorkbenchPanelId): boolean {
  return (
    panelId === "diagram" ||
    panelId === "table" ||
    panelId === "matrix" ||
    panelId === "document"
  );
}

export function controlledPanelAction(panelId: WorkbenchPanelId): {
  readonly activePanel?: WorkbenchPanelId;
  readonly leftPaneMode?: LeftPaneMode;
  readonly inspectorOpen?: true;
  readonly validateOpen?: true;
} {
  if (panelId === "inspector") return { inspectorOpen: true };
  if (panelId === "validate") return { validateOpen: true };
  const nextPanel = panelId === "tree" ? "diagram" : panelId;
  if (!isPrimaryView(nextPanel)) return {};
  return {
    activePanel: nextPanel,
    leftPaneMode: leftPaneModeForPanel(nextPanel),
  };
}

export interface WorkbenchProps {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly templateCode?: string | null;
  readonly viewClient: ViewClient;
  readonly commandClient: CommandClient;
  readonly selection: SelectionCoordinator;
  readonly onError: (message: string) => void;
  readonly onToggleTheme: () => void;
  readonly themeLabel: string;
  readonly commandRegistry?: CommandRegistry;
}

const dockviewComponents: Record<
  WorkbenchPanelId,
  (props: IDockviewPanelProps) => ReactElement
> = {
  diagram: () => <DiagramPanel />,
  floorplan: () => <FloorplanPanel />,
  table: () => <TablePanel />,
  matrix: () => <MatrixPanel />,
  mapping: () => <MappingPanel />,
  document: () => <DocumentPanel />,
  tree: () => <TreePanel />,
  inspector: () => <InspectorPanel />,
  validate: () => <ValidatePanel />,
  verification: () => <VerificationDashboardPanel />,
  ai: () => <AiPanel />,
  review: () => <ReviewPanel />,
  assembly: () => <AssemblyCatalogPanel />,
  exchange: () => <ExchangePanel />,
  snapshot: () => <SnapshotPanel />,
};

export function renderPrimaryView(panelId: WorkbenchPanelId): ReactElement {
  if (panelId === "table") return <TablePanel />;
  if (panelId === "matrix") return <MatrixPanel />;
  if (panelId === "document") return <DocumentPanel />;
  return <DiagramPanel />;
}

const defaultObjectType = "room";
const defaultRelationType = "adjacent";
const defaultRootId = "";

export interface WorkbenchDefaults {
  readonly objectType: string;
  readonly relationType: string;
  readonly rootId: string;
  readonly activePanel: WorkbenchPanelId;
  readonly startupPanels: readonly WorkbenchPanelId[];
  readonly rootObjectType?: string;
}

export function workbenchDefaultsForTemplate(
  templateCode?: string | null,
): WorkbenchDefaults {
  if (templateCode === "technical_proposal") {
    return {
      objectType: "module",
      relationType: "proposal_contains_module",
      rootId: "",
      activePanel: "diagram",
      startupPanels: [],
      rootObjectType: "proposal",
    };
  }
  return {
    objectType: defaultObjectType,
    relationType: defaultRelationType,
    rootId: defaultRootId,
    activePanel: "tree",
    startupPanels: [],
  };
}

export function Workbench({
  actorId,
  workspaceId,
  templateCode,
  viewClient,
  commandClient,
  selection,
  onError,
  onToggleTheme,
  themeLabel,
  commandRegistry,
}: WorkbenchProps): ReactElement {
  const defaults = useMemo(
    () => workbenchDefaultsForTemplate(templateCode),
    [templateCode],
  );
  const [objectType, setAppliedObjectType] = useState(defaults.objectType);
  const [relationType, setAppliedRelationType] = useState(
    defaults.relationType,
  );
  const [rootId, setAppliedRootId] = useState(defaults.rootId);
  const [draftObjectType, setDraftObjectType] = useState(defaults.objectType);
  const [draftRelationType, setDraftRelationType] = useState(
    defaults.relationType,
  );
  const [draftRootId, setDraftRootId] = useState(defaults.rootId);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<WorkbenchPanelId>(
    defaults.activePanel,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leftPaneMode, setLeftPaneMode] = useState<LeftPaneMode>("view-tree");
  const [connectionMode, setConnectionMode] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const isTechnicalProposal = templateCode === "technical_proposal";

  const refreshViews = useCallback(
    () => setRefreshVersion((value) => value + 1),
    [],
  );
  const autoCheckAfterSave = useCallback(
    () => runSaveAutoCheck({ actorId, workspaceId, viewClient, refreshViews }),
    [actorId, refreshViews, viewClient, workspaceId],
  );
  const setObjectType = useCallback((value: string) => {
    setAppliedObjectType(value);
    setDraftObjectType(value);
  }, []);
  const setRelationType = useCallback((value: string) => {
    setAppliedRelationType(value);
    setDraftRelationType(value);
  }, []);
  const setRootId = useCallback((value: string) => {
    setAppliedRootId(value);
    setDraftRootId(value);
  }, []);
  const applyWorkbenchParameters = useCallback(() => {
    setAppliedObjectType(draftObjectType);
    setAppliedRelationType(draftRelationType);
    setAppliedRootId(draftRootId);
    refreshViews();
  }, [draftObjectType, draftRelationType, draftRootId, refreshViews]);

  const activatePanel = useCallback(
    (panelId: CommandPanelId) => {
      if (isTechnicalProposal) {
        const action = controlledPanelAction(panelId);
        if (action.inspectorOpen) setInspectorOpen(true);
        if (action.validateOpen) setValidateOpen(true);
        if (action.activePanel) {
          setActivePanel(action.activePanel);
          if (action.activePanel !== "diagram") {
            setConnectionMode((current) =>
              nextConnectionMode(current, "viewChanged"),
            );
          }
        }
        if (action.leftPaneMode) setLeftPaneMode(action.leftPaneMode);
        return;
      }
      if (!dockviewApi) return;
      openWorkbenchPanel(dockviewApi, panelId);
      setActivePanel(panelId);
    },
    [dockviewApi, isTechnicalProposal],
  );
  const openShellPanel = useCallback(
    (panelId: WorkbenchPanelId) => {
      if (isTechnicalProposal) {
        const action = controlledPanelAction(panelId);
        if (action.inspectorOpen) setInspectorOpen(true);
        if (action.validateOpen) setValidateOpen(true);
        if (action.activePanel) {
          setActivePanel(action.activePanel);
          if (action.activePanel !== "diagram") {
            setConnectionMode((current) =>
              nextConnectionMode(current, "viewChanged"),
            );
          }
        }
        if (action.leftPaneMode) setLeftPaneMode(action.leftPaneMode);
        return;
      }
      if (!dockviewApi) return;
      openWorkbenchPanel(dockviewApi, panelId);
      setActivePanel(panelId);
    },
    [dockviewApi, isTechnicalProposal],
  );
  // 因选择而被动揭示面板:激活但不抢 DOM 焦点,避免 blur 掉正在编辑的输入框。
  const revealShellPanel = useCallback(
    (panelId: WorkbenchPanelId) => {
      if (isTechnicalProposal) {
        if (panelId === "inspector") setInspectorOpen(true);
        if (panelId === "validate") setValidateOpen(true);
        return;
      }
      if (!dockviewApi) return;
      openWorkbenchPanel(dockviewApi, panelId, { focus: false });
      setActivePanel(panelId);
    },
    [dockviewApi, isTechnicalProposal],
  );

  useEffect(
    () =>
      selection.subscribe((selected) => {
        const shouldOpen = shouldOpenInspectorForSelection(selected);
        if (isTechnicalProposal) {
          setInspectorOpen(shouldOpen);
          return;
        }
        if (shouldOpen) {
          revealShellPanel("inspector");
        }
      }),
    [isTechnicalProposal, revealShellPanel, selection],
  );

  const generateOutput = useCallback(
    async (format: OutputFormat) => {
      const detail = await generateDocumentOutput({
        actorId,
        format,
        objectType,
        relationType,
        rootId,
        rootObjectType: defaults.rootObjectType,
        viewClient,
        workspaceId,
      });
      downloadOutput(detail);
    },
    [
      actorId,
      defaults.rootObjectType,
      objectType,
      relationType,
      rootId,
      viewClient,
      workspaceId,
    ],
  );
  const generateOutputSafely = useCallback(
    (format: OutputFormat): void => {
      void generateOutput(format).catch((error) =>
        onError(error instanceof Error ? error.message : "生成文档失败"),
      );
    },
    [generateOutput, onError],
  );
  const revalidate = useCallback(() => {
    openShellPanel("validate");
    refreshViews();
  }, [openShellPanel, refreshViews]);

  useEffect(() => {
    if (!defaults.rootObjectType || rootId.trim() !== "") return;
    // 进门瞬间读模型可能还没投影到方案根:重试 10 次×500ms;refreshVersion 变化时整体重跑再触发。
    const rootType = defaults.rootObjectType;
    let disposed = false;
    let remaining = 10;
    let timer: number | undefined;
    const scheduleRetry = () => {
      remaining -= 1;
      if (remaining > 0) timer = window.setTimeout(tryDiscover, 500);
    };
    function tryDiscover(): void {
      void viewClient
        .objects(workspaceId, rootType, 0, 1)
        .then((page) => {
          if (disposed) return;
          const firstRootId = page.items[0]?.objectId;
          if (firstRootId) setRootId(firstRootId);
          else scheduleRetry();
        })
        .catch(() => {
          if (!disposed) scheduleRetry();
        });
    }
    tryDiscover();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    defaults.rootObjectType,
    refreshVersion,
    rootId,
    setRootId,
    viewClient,
    workspaceId,
  ]);

  const context = useMemo<WorkbenchContextValue>(
    () => ({
      actorId,
      workspaceId,
      templateCode,
      objectType,
      relationType,
      rootId,
      refreshVersion,
      connectionMode,
      viewClient,
      commandClient,
      selection,
      setObjectType,
      setRelationType,
      setRootId,
      refreshViews,
      setConnectionMode,
      autoCheckAfterSave,
      reportError: onError,
    }),
    [
      actorId,
      autoCheckAfterSave,
      commandClient,
      connectionMode,
      objectType,
      onError,
      refreshVersion,
      refreshViews,
      relationType,
      rootId,
      selection,
      setObjectType,
      setConnectionMode,
      setRelationType,
      setRootId,
      templateCode,
      viewClient,
      workspaceId,
    ],
  );

  const commandContext = useMemo<CommandContext>(
    () => ({
      workspaceId,
      objectType,
      viewClient,
      commandClient,
      generateOutput,
      selection,
      activatePanel,
      openPanel: activatePanel,
      setRootId,
      refreshViews,
    }),
    [
      activatePanel,
      commandClient,
      generateOutput,
      objectType,
      refreshViews,
      selection,
      setRootId,
      viewClient,
      workspaceId,
    ],
  );

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (!isCommandPaletteShortcut(event)) return;
      event.preventDefault();
      setCommandPaletteOpen(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <WorkbenchContext.Provider value={context}>
      <section aria-label="制图工作台" className="dock-workbench">
        <WorkbenchShellChrome
          activePanel={activePanel}
          advancedOpen={settingsOpen}
          connectionMode={connectionMode}
          connectionModeAvailable={
            isTechnicalProposal && activePanel === "diagram"
          }
          createObjectAction={
            templateCode === "technical_proposal" ? (
              <CreateObjectForm onOpenPanel={openShellPanel} />
            ) : null
          }
          documentOutputAction={
            <DocumentOutputAction
              actorId={actorId}
              objectType={objectType}
              relationType={relationType}
              reportError={onError}
              rootId={rootId}
              rootObjectType={defaults.rootObjectType}
              viewClient={viewClient}
              workspaceId={workspaceId}
            />
          }
          visibleViewIds={
            templateCode === "technical_proposal"
              ? ["diagram", "table", "matrix", "document"]
              : undefined
          }
          onGenerateOutput={generateOutputSafely}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenPanel={openShellPanel}
          onRefreshViews={refreshViews}
          onRevalidate={revalidate}
          onSelectTool={() =>
            setConnectionMode((current) =>
              nextConnectionMode(current, "selectTool"),
            )
          }
          onToggleConnectionMode={
            isTechnicalProposal
              ? () => setConnectionMode((current) => !current)
              : undefined
          }
          onToggleValidate={
            isTechnicalProposal
              ? () => setValidateOpen((value) => !value)
              : undefined
          }
          onToggleAdvanced={() => setSettingsOpen((value) => !value)}
          onToggleTheme={onToggleTheme}
          themeLabel={themeLabel}
        />
        {templateCode === "technical_proposal" ? <ProposalSummaryBar /> : null}
        {settingsOpen ? (
          <div className="workbench-controls" aria-label="高级视图设置">
            {templateCode === "technical_proposal" ? (
              <span>新增模块/需求请使用顶栏表单</span>
            ) : (
              <label>
                对象类型
                <input
                  onChange={(event) =>
                    setDraftObjectType(event.currentTarget.value)
                  }
                  value={draftObjectType}
                />
              </label>
            )}
            <label>
              关系类型
              <input
                onChange={(event) =>
                  setDraftRelationType(event.currentTarget.value)
                }
                value={draftRelationType}
              />
            </label>
            <label>
              根对象
              <input
                onChange={(event) => setDraftRootId(event.currentTarget.value)}
                value={draftRootId}
              />
            </label>
            <button onClick={applyWorkbenchParameters} type="button">
              应用并刷新
            </button>
          </div>
        ) : null}
        {isTechnicalProposal ? (
          <div className="workbench-main workbench-main-controlled">
            <div className="workbench-controlled-row">
              <div className="workbench-left-pane">
                {leftPaneMode === "view-tree" ? (
                  <ViewTreePanel
                    activatePanel={openShellPanel}
                    setLeftPaneMode={setLeftPaneMode}
                  />
                ) : (
                  <DiagramToolsPanel
                    onBack={() => setLeftPaneMode("view-tree")}
                    setLeftPaneMode={setLeftPaneMode}
                  />
                )}
              </div>
              <div className="workbench-primary-view">
                {renderPrimaryView(activePanel)}
              </div>
              {inspectorOpen ? (
                <aside className="workbench-inspector-column">
                  <section className="workbench-side-panel">
                    <header>
                      <strong>属性 / 校验</strong>
                      <button
                        onClick={() => setInspectorOpen(false)}
                        type="button"
                      >
                        关闭
                      </button>
                    </header>
                    <InspectorPanel />
                  </section>
                </aside>
              ) : null}
            </div>
            <ValidationDrawer
              onClose={() => setValidateOpen(false)}
              onToggle={() => setValidateOpen((value) => !value)}
              open={validateOpen}
            />
          </div>
        ) : (
          <div className="workbench-main">
            <div className="dockview-theme-light mnext-dockview-theme workbench-dock">
              <DockviewReact
                components={dockviewComponents}
                onReady={(event: DockviewReadyEvent) => {
                  setDockviewApi(event.api);
                  ensureWorkbenchPanels(event.api, templateCode);
                  defaults.startupPanels.forEach((panel) =>
                    openWorkbenchPanel(event.api, panel),
                  );
                  openWorkbenchPanel(event.api, defaults.activePanel);
                  setActivePanel(defaults.activePanel);
                }}
              />
            </div>
          </div>
        )}
        <CommandPalette
          context={commandContext}
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onError={onError}
          registry={commandRegistry}
        />
      </section>
    </WorkbenchContext.Provider>
  );
}
