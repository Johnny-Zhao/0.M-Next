import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
} from "react";

import { CommandClient, SelectionCoordinator, ViewClient } from "@m-next/views";

import { DiagramPanel } from "./diagram-panel";
import { InspectorPanel } from "./inspector-panel";
import { TreePanel } from "./tree-panel";

export type WorkbenchPanelId = "diagram" | "tree" | "inspector";

export interface WorkbenchPanelDefinition {
  readonly id: WorkbenchPanelId;
  readonly title: string;
  readonly component: WorkbenchPanelId;
}

export const workbenchPanelDefinitions: readonly WorkbenchPanelDefinition[] = [
  { id: "diagram", title: "图", component: "diagram" },
  { id: "tree", title: "模型树", component: "tree" },
  { id: "inspector", title: "属性/校验", component: "inspector" },
];

export interface WorkbenchContextValue {
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
}

export interface WorkbenchProps {
  readonly workspaceId: string;
  readonly viewClient: ViewClient;
  readonly commandClient: CommandClient;
  readonly selection: SelectionCoordinator;
  readonly onError: (message: string) => void;
}

const dockviewComponents: Record<
  WorkbenchPanelId,
  (props: IDockviewPanelProps) => ReactElement
> = {
  diagram: () => <DiagramPanel />,
  tree: () => <TreePanel />,
  inspector: () => <InspectorPanel />,
};

export function Workbench({
  workspaceId,
  viewClient,
  commandClient,
  selection,
  onError,
}: WorkbenchProps): ReactElement {
  const [objectType, setObjectType] = useState("demo_object");
  const [relationType, setRelationType] = useState("depends_on");
  const [rootId, setRootId] = useState("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const context = useMemo<WorkbenchContextValue>(
    () => ({
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
      refreshViews: () => setRefreshVersion((value) => value + 1),
      reportError: onError,
    }),
    [
      commandClient,
      objectType,
      onError,
      refreshVersion,
      relationType,
      rootId,
      selection,
      viewClient,
      workspaceId,
    ],
  );

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
        </div>
        <div className="dockview-theme-light workbench-dock">
          <DockviewReact
            components={dockviewComponents}
            onReady={(event: DockviewReadyEvent) =>
              ensureWorkbenchPanels(event.api)
            }
          />
        </div>
      </section>
    </WorkbenchContext.Provider>
  );
}
