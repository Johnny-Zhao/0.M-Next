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
import { InspectorPanel } from "./inspector-panel";
import { TreePanel } from "./tree-panel";
import { ValidatePanel } from "./validate-panel";

export type WorkbenchPanelId = "diagram" | "tree" | "inspector" | "validate";

export interface WorkbenchPanelDefinition {
  readonly id: WorkbenchPanelId;
  readonly title: string;
  readonly component: WorkbenchPanelId;
}

export const workbenchPanelDefinitions: readonly WorkbenchPanelDefinition[] = [
  { id: "diagram", title: "图", component: "diagram" },
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
  const [diagram, tree, inspector] = workbenchPanelDefinitions;
  api.addPanel(diagram);
  api.addPanel({
    ...tree,
    inactive: true,
    initialWidth: 260,
    position: { direction: "left", referencePanel: diagram.id },
  });
  api.addPanel({
    ...inspector,
    inactive: true,
    initialWidth: 320,
    position: { direction: "right", referencePanel: diagram.id },
  });
  const validate = workbenchPanelDefinitions[3];
  if (validate) {
    api.addPanel({
      ...validate,
      inactive: true,
      initialHeight: 200,
      position: { direction: "below", referencePanel: diagram.id },
    });
  }
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
  tree: () => <TreePanel />,
  inspector: () => <InspectorPanel />,
  validate: () => <ValidatePanel />,
};

export function Workbench({
  actorId,
  workspaceId,
  viewClient,
  commandClient,
  selection,
  onError,
  commandRegistry,
}: WorkbenchProps): ReactElement {
  const [objectType, setObjectType] = useState("demo_object");
  const [relationType, setRelationType] = useState("depends_on");
  const [rootId, setRootId] = useState("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const refreshViews = useCallback(
    () => setRefreshVersion((value) => value + 1),
    [],
  );

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
              onChange={(event) => setObjectType(event.currentTarget.value)}
              value={objectType}
            />
          </label>
          <label>
            关系类型
            <input
              onChange={(event) => setRelationType(event.currentTarget.value)}
              value={relationType}
            />
          </label>
          <label>
            根对象
            <input
              onChange={(event) => setRootId(event.currentTarget.value)}
              value={rootId}
            />
          </label>
          <button onClick={context.refreshViews} type="button">
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
