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
import { InspectorPanel } from "./inspector-panel";
import { MatrixPanel } from "./matrix-panel";
import { TablePanel } from "./table-panel";
import { TreePanel } from "./tree-panel";
import { ValidatePanel } from "./validate-panel";

export type WorkbenchPanelId =
  | "diagram"
  | "table"
  | "matrix"
  | "document"
  | "tree"
  | "inspector"
  | "validate";

export interface WorkbenchPanelDefinition {
  readonly id: WorkbenchPanelId;
  readonly title: string;
  readonly component: WorkbenchPanelId;
}

export const workbenchPanelDefinitions: readonly WorkbenchPanelDefinition[] = [
  { id: "diagram", title: "图", component: "diagram" },
  { id: "table", title: "表格", component: "table" },
  { id: "matrix", title: "矩阵", component: "matrix" },
  { id: "document", title: "文档", component: "document" },
  { id: "tree", title: "模型树", component: "tree" },
  { id: "inspector", title: "属性/校验", component: "inspector" },
  { id: "validate", title: "校验", component: "validate" },
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
  // 表格 / 矩阵 / 文档 与「图」同组,呈现为视图切换标签页
  api.addPanel({ ...byId("table"), inactive: true });
  api.addPanel({ ...byId("matrix"), inactive: true });
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
  readonly viewClient: ViewClient;
  readonly commandClient: CommandClient;
  readonly selection: SelectionCoordinator;
  readonly onError: (message: string) => void;
  readonly commandRegistry?: CommandRegistry;
}

const dockviewComponents: Record<
  WorkbenchPanelId,
  (props: IDockviewPanelProps) => ReactElement
> = {
  diagram: () => <DiagramPanel />,
  table: () => <TablePanel />,
  matrix: () => <MatrixPanel />,
  document: () => <DocumentPanel />,
  tree: () => <TreePanel />,
  inspector: () => <InspectorPanel />,
  validate: () => <ValidatePanel />,
};
const defaultObjectType = "room";
const defaultRelationType = "adjacent";
const defaultRootId = "";

export function Workbench({
  actorId,
  workspaceId,
  viewClient,
  commandClient,
  selection,
  onError,
  commandRegistry,
}: WorkbenchProps): ReactElement {
  const [objectType, setAppliedObjectType] = useState(defaultObjectType);
  const [relationType, setAppliedRelationType] = useState(defaultRelationType);
  const [rootId, setAppliedRootId] = useState(defaultRootId);
  const [draftObjectType, setDraftObjectType] = useState(defaultObjectType);
  const [draftRelationType, setDraftRelationType] =
    useState(defaultRelationType);
  const [draftRootId, setDraftRootId] = useState(defaultRootId);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const refreshViews = useCallback(
    () => setRefreshVersion((value) => value + 1),
    [],
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
    },
    [dockviewApi],
  );

  const generateOutput = useCallback(
    async (format: OutputFormat) => {
      const detail = await generateDocumentOutput({
        actorId,
        format,
        objectType,
        viewClient,
        workspaceId,
      });
      downloadOutput(detail);
    },
    [actorId, objectType, viewClient, workspaceId],
  );

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
      reportError: onError,
    }),
    [
      actorId,
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
        <div className="workbench-controls" aria-label="工作台参数">
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
            刷新
          </button>
          <DocumentOutputAction
            actorId={actorId}
            objectType={objectType}
            reportError={onError}
            viewClient={viewClient}
            workspaceId={workspaceId}
          />
        </div>
        <div className="dockview-theme-light mnext-dockview-theme workbench-dock">
          <DockviewReact
            components={dockviewComponents}
            onReady={(event: DockviewReadyEvent) => {
              setDockviewApi(event.api);
              ensureWorkbenchPanels(event.api);
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
