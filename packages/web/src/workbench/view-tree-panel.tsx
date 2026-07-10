import type { ReactElement } from "react";

import type { LeftPaneMode, WorkbenchPanelId } from "./workbench";

export interface ViewTreeItem {
  readonly id: string;
  readonly label: string;
  readonly badge: string;
  readonly panelId?: WorkbenchPanelId;
  readonly mode: LeftPaneMode;
  readonly disabled?: boolean;
}

export interface ViewTreeGroup {
  readonly title: string;
  readonly items: readonly ViewTreeItem[];
}

export const viewTreeGroups: readonly ViewTreeGroup[] = [
  {
    title: "总体设计",
    items: [
      {
        id: "diagram",
        label: "系统总图",
        badge: "图",
        panelId: "diagram",
        mode: "diagram-tools",
      },
      {
        id: "table",
        label: "参数总表",
        badge: "表",
        panelId: "table",
        mode: "view-tree",
      },
      {
        id: "matrix",
        label: "依赖矩阵",
        badge: "矩阵",
        panelId: "matrix",
        mode: "view-tree",
      },
    ],
  },
  {
    title: "分析",
    items: [
      {
        id: "power",
        label: "功率仪表盘",
        badge: "BI",
        mode: "view-tree",
        disabled: true,
      },
      {
        id: "layout",
        label: "系统布局",
        badge: "布局图",
        mode: "view-tree",
        disabled: true,
      },
    ],
  },
  {
    title: "文档",
    items: [
      {
        id: "document",
        label: "设计说明",
        badge: "文本",
        panelId: "document",
        mode: "view-tree",
      },
    ],
  },
];

export function viewTreeItemAction(
  item: ViewTreeItem,
): { readonly panelId: WorkbenchPanelId; readonly mode: LeftPaneMode } | null {
  if (item.disabled || !item.panelId) return null;
  return { panelId: item.panelId, mode: item.mode };
}

export function ViewTreePanel(props: {
  readonly activatePanel: (panelId: WorkbenchPanelId) => void;
  readonly setLeftPaneMode: (mode: LeftPaneMode) => void;
}): ReactElement {
  return (
    <aside className="view-tree-panel" aria-label="视图树">
      <header>
        <strong>视图树</strong>
      </header>
      <div className="view-tree-groups">
        {viewTreeGroups.map((group) => (
          <section className="view-tree-group" key={group.title}>
            <h2>
              <span>{group.title}</span>
              <small>{group.items.length}</small>
            </h2>
            <div className="view-tree-items">
              {group.items.map((item) => (
                <button
                  disabled={item.disabled}
                  key={item.id}
                  onClick={() => {
                    const action = viewTreeItemAction(item);
                    if (!action) return;
                    props.activatePanel(action.panelId);
                    props.setLeftPaneMode(action.mode);
                  }}
                  type="button"
                >
                  <span>{item.label}</span>
                  <small>{item.badge}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
