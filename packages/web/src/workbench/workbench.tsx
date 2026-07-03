import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";

import {
  CommandClient,
  SelectionCoordinator,
  ViewClient,
  type OutputFormat,
} from "@m-next/views";

import { AiPanel } from "./ai-panel";
import { AssemblyCatalogPanel } from "./assembly-catalog-panel";
import { CommandPalette, isCommandPaletteShortcut } from "./command-palette";
import type {
  CommandContext,
  CommandPanelId,
  CommandRegistry,
} from "./commands";
import { DiagramPanel } from "./diagram-panel";
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
import { ReviewPanel } from "./review-panel";
import { runSaveAutoCheck } from "./save-auto-check";
import { WorkbenchShellChrome } from "./shell-chrome";
import { SnapshotPanel } from "./snapshot-panel";
import { TablePanel } from "./table-panel";
import { TreePanel } from "./tree-panel";
import { ValidatePanel } from "./validate-panel";
import { VerificationDashboardPanel } from "./verification-dashboard-panel";

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
  readonly objectType: string;
  readonly relationType: string;
  readonly rootId: string;
  readonly refreshVersion: number;
  readonly viewClient: ViewClient;
  readonly commandClient: CommandClient;
  readonly selection: SelectionCoordinator;
  readonly setObjectType: (value: string) => void;
  readonly setRelationType: (value: string) => void;
  readonly setRootId: (value: string) => void;
  readonly refreshViews: () => void;
  readonly autoCheckAfterSave: () => Promise<void>;
  readonly reportError: (message: string) => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbenchContext(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error("Workbench context is missing");
  return context;
}

export function ensureWorkbenchPanels(api: DockviewApi): void {
  if (api.panels.length > 0) return;
  const byId = (id: WorkbenchPanelId): WorkbenchPanelDefinition =>
    workbenchPanelDefinitions.find((panel) => panel.id === id) ??
    workbenchPanelDefinitions[0];
  api.addPanel(byId("diagram"));
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
): void {
  const existing = api.getPanel(panelId);
  if (existing) {
    existing.api.setActive();
    api.focus();
    return;
  }
  const definition = workbenchPanelDefinitions.find(
    (panel) => panel.id === panelId,
  );
  if (!definition) return;
  const panel = api.addPanel(definition);
  panel.api.setActive();
  api.focus();
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
      activePanel: "document",
      startupPanels: ["table", "validate", "document"],
      rootObjectType: "proposal",
    };
  }
  return {
    objectType: defaultObjectType,
    relationType: defaultRelationType,
    rootId: defaultRootId,
    activePanel: "diagram",
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
      if (!dockviewApi) return;
      openWorkbenchPanel(dockviewApi, panelId);
      setActivePanel(panelId);
    },
    [dockviewApi],
  );
  const openShellPanel = useCallback(
    (panelId: WorkbenchPanelId) => {
      if (!dockviewApi) return;
      openWorkbenchPanel(dockviewApi, panelId);
      setActivePanel(panelId);
    },
    [dockviewApi],
  );

  const generateOutput = useCallback(
    async (format: OutputFormat) => {
      const detail = await generateDocumentOutput({
        actorId,
        format,
        objectType,
        relationType,
        rootId,
        viewClient,
        workspaceId,
      });
      downloadOutput(detail);
    },
    [actorId, objectType, relationType, rootId, viewClient, workspaceId],
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
    let disposed = false;
    void viewClient
      .objects(workspaceId, defaults.rootObjectType, 0, 1)
      .then((page) => {
        const firstRootId = page.items[0]?.objectId;
        if (!disposed && firstRootId) setRootId(firstRootId);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [defaults.rootObjectType, rootId, setRootId, viewClient, workspaceId]);

  const context = useMemo<WorkbenchContextValue>(
    () => ({
      actorId,
      workspaceId,
      objectType,
      relationType,
      rootId,
      refreshVersion,
      viewClient,
      commandClient,
      selection,
      setObjectType,
      setRelationType,
      setRootId,
      refreshViews,
      autoCheckAfterSave,
      reportError: onError,
    }),
    [
      actorId,
      autoCheckAfterSave,
      commandClient,
      objectType,
      onError,
      refreshVersion,
      refreshViews,
      relationType,
      rootId,
      selection,
      setObjectType,
      setRelationType,
      setRootId,
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
          documentOutputAction={
            <DocumentOutputAction
              actorId={actorId}
              objectType={objectType}
              relationType={relationType}
              reportError={onError}
              rootId={rootId}
              viewClient={viewClient}
              workspaceId={workspaceId}
            />
          }
          onGenerateOutput={generateOutputSafely}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenPanel={openShellPanel}
          onRefreshViews={refreshViews}
          onRevalidate={revalidate}
          onToggleAdvanced={() => setSettingsOpen((value) => !value)}
          onToggleTheme={onToggleTheme}
          themeLabel={themeLabel}
        />
        {settingsOpen ? (
          <div className="workbench-controls" aria-label="高级视图设置">
            <label>
              对象类型
              <input
                onChange={(event) =>
                  setDraftObjectType(event.currentTarget.value)
                }
                value={draftObjectType}
              />
            </label>
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
        <div className="dockview-theme-light mnext-dockview-theme workbench-dock">
          <DockviewReact
            components={dockviewComponents}
            onReady={(event: DockviewReadyEvent) => {
              setDockviewApi(event.api);
              ensureWorkbenchPanels(event.api);
              defaults.startupPanels.forEach((panel) =>
                openWorkbenchPanel(event.api, panel),
              );
              setActivePanel(defaults.activePanel);
            }}
          />
        </div>
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
