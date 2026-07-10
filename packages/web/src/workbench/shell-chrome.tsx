import { useState, type ReactElement, type ReactNode } from "react";

import type { OutputFormat } from "@m-next/views";

import type { WorkbenchPanelId } from "./workbench";

export const shellMenuLabels = [
  "文件",
  "编辑",
  "视图",
  "模型",
  "校验",
] as const;
export const shellToolbarViewLabels = [
  "图",
  "表",
  "矩阵",
  "映射",
  "文档",
  "平面图",
] as const;
export const shellDimensionLabels = [
  "全部",
  "能量",
  "热",
  "质量",
  "光",
  "风",
] as const;

const showToolbarDimensionControls = false;

interface WorkbenchShellChromeProps {
  readonly activePanel: WorkbenchPanelId;
  readonly advancedOpen: boolean;
  readonly connectionMode?: boolean;
  readonly connectionModeAvailable?: boolean;
  readonly createObjectAction?: ReactNode;
  readonly documentOutputAction: ReactNode;
  readonly themeLabel: string;
  readonly visibleViewIds?: readonly WorkbenchPanelId[];
  readonly onGenerateOutput: (format: OutputFormat) => void;
  readonly onOpenCommandPalette: () => void;
  readonly onOpenPanel: (panelId: WorkbenchPanelId) => void;
  readonly onRefreshViews: () => void;
  readonly onRevalidate: () => void;
  readonly onSelectTool?: () => void;
  readonly onToggleConnectionMode?: () => void;
  readonly onToggleValidate?: () => void;
  readonly onToggleAdvanced: () => void;
  readonly onToggleTheme: () => void;
}

interface MenuItem {
  readonly label: string;
  readonly tag?: string;
  readonly disabled?: boolean;
  readonly separator?: boolean;
  readonly run?: () => void;
}

interface MenuGroup {
  readonly label: (typeof shellMenuLabels)[number];
  readonly items: readonly MenuItem[];
}

const viewEntries: readonly {
  readonly id: WorkbenchPanelId;
  readonly label: (typeof shellToolbarViewLabels)[number];
}[] = [
  { id: "diagram", label: "图" },
  { id: "table", label: "表" },
  { id: "matrix", label: "矩阵" },
  { id: "mapping", label: "映射" },
  { id: "document", label: "文档" },
  { id: "floorplan", label: "平面图" },
];

export function validateToolbarAction(
  onRevalidate: () => void,
  onToggleValidate?: () => void,
): () => void {
  return onToggleValidate ?? onRevalidate;
}

export function WorkbenchShellChrome({
  activePanel,
  advancedOpen,
  connectionMode = false,
  connectionModeAvailable = false,
  createObjectAction,
  documentOutputAction,
  themeLabel,
  visibleViewIds,
  onGenerateOutput,
  onOpenCommandPalette,
  onOpenPanel,
  onRefreshViews,
  onRevalidate,
  onSelectTool,
  onToggleConnectionMode,
  onToggleValidate,
  onToggleAdvanced,
  onToggleTheme,
}: WorkbenchShellChromeProps): ReactElement {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const toolbarViewEntries = visibleViewIds
    ? viewEntries.filter((view) => visibleViewIds.includes(view.id))
    : viewEntries;
  const canToggleConnectionMode =
    connectionModeAvailable && Boolean(onToggleConnectionMode);

  const runMenuItem = (item: MenuItem): void => {
    if (item.disabled || !item.run) return;
    item.run();
    setOpenMenu(null);
  };

  const menuGroups: readonly MenuGroup[] = [
    {
      label: "文件",
      items: [
        {
          label: "导出 Markdown",
          tag: "MD",
          run: () => onGenerateOutput("markdown"),
        },
        { label: "导出 PDF", tag: "PDF", run: () => onGenerateOutput("pdf") },
        { separator: true, label: "" },
        { label: "交换导入 / 导出", run: () => onOpenPanel("exchange") },
        { label: "快照与对比", run: () => onOpenPanel("snapshot") },
        { label: "打开文档面板", run: () => onOpenPanel("document") },
        { label: "打开 AI 助手", run: () => onOpenPanel("ai") },
      ],
    },
    {
      label: "编辑",
      items: [
        { label: "搜索 / 命令", tag: "Ctrl K", run: onOpenCommandPalette },
        { label: "选择工具", tag: "默认", disabled: true },
      ],
    },
    {
      label: "视图",
      items: [
        ...viewEntries.map((view) => ({
          label: `打开${view.label}`,
          tag: activePanel === view.id ? "当前" : undefined,
          run: () => onOpenPanel(view.id),
        })),
        { separator: true, label: "" },
        { label: "模型树", run: () => onOpenPanel("tree") },
        { label: "属性/校验", run: () => onOpenPanel("inspector") },
        { label: "评审批注", run: () => onOpenPanel("review") },
        { label: "交换导入", run: () => onOpenPanel("exchange") },
        { label: "快照对比", run: () => onOpenPanel("snapshot") },
        {
          label: advancedOpen ? "收起视图设置" : "高级 / 视图设置",
          run: onToggleAdvanced,
        },
      ],
    },
    {
      label: "模型",
      items: [
        { label: "刷新视图", run: onRefreshViews },
        { label: "装配目录", run: () => onOpenPanel("assembly") },
        { label: "AI 提议", run: () => onOpenPanel("ai") },
        { label: "自动布局", tag: "待接入", disabled: true },
      ],
    },
    {
      label: "校验",
      items: [
        { label: "打开校验面板", run: () => onOpenPanel("validate") },
        { label: "验证仪表", run: () => onOpenPanel("verification") },
        { label: "打开批注面板", run: () => onOpenPanel("review") },
        { label: "重新校验", run: onRevalidate },
      ],
    },
  ];

  return (
    <div className="workbench-shell-chrome">
      <nav aria-label="工作台菜单" className="workbench-menu-bar">
        {menuGroups.map((group) => (
          <div className="workbench-menu" key={group.label}>
            <button
              aria-expanded={openMenu === group.label}
              className="workbench-menu-trigger"
              onClick={() =>
                setOpenMenu(openMenu === group.label ? null : group.label)
              }
              type="button"
            >
              {group.label}
            </button>
            {openMenu === group.label ? (
              <div className="workbench-menu-popover" role="menu">
                {group.items.map((item, index) =>
                  item.separator ? (
                    <div
                      className="workbench-menu-separator"
                      key={`${group.label}-${index}`}
                    />
                  ) : (
                    <button
                      className="workbench-menu-item"
                      disabled={item.disabled}
                      key={`${group.label}-${item.label}`}
                      onClick={() => runMenuItem(item)}
                      role="menuitem"
                      type="button"
                    >
                      <span>{item.label}</span>
                      {item.tag ? <small>{item.tag}</small> : null}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ))}
        <button
          className="workbench-command-search"
          onClick={onOpenCommandPalette}
          type="button"
        >
          <Icon name="search" />
          <span>搜索 / 命令...</span>
          <kbd>Ctrl K</kbd>
        </button>
      </nav>
      <div
        aria-label="工作台工具条"
        className="workbench-toolbar"
        role="toolbar"
      >
        <button
          aria-pressed={!connectionMode}
          className="workbench-tool-button"
          onClick={onSelectTool}
          title="选择"
          type="button"
        >
          <Icon name="cursor" />
          <span>选择</span>
        </button>
        <button
          aria-pressed={connectionMode}
          className="workbench-tool-button"
          disabled={!canToggleConnectionMode}
          onClick={onToggleConnectionMode}
          title={
            connectionModeAvailable
              ? "连线:在画布中从端口拖拽创建"
              : "请切到图视图后进入连线模式"
          }
          type="button"
        >
          <Icon name="link" />
          <span>连线</span>
        </button>
        <button
          className="workbench-tool-button"
          disabled
          title="自动布局待接入"
          type="button"
        >
          <Icon name="layout" />
          <span>自动布局</span>
        </button>
        <span className="workbench-toolbar-separator" />
        {createObjectAction}
        {createObjectAction ? (
          <span className="workbench-toolbar-separator" />
        ) : null}
        <div aria-label="视图入口" className="workbench-view-switcher">
          {toolbarViewEntries.map((view) => (
            <button
              aria-pressed={activePanel === view.id}
              key={view.id}
              onClick={() => onOpenPanel(view.id)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </div>
        {showToolbarDimensionControls ? (
          <>
            <span className="workbench-toolbar-separator" />
            <div aria-label="维度" className="workbench-dimension-segments">
              {shellDimensionLabels.map((label, index) => (
                <button
                  aria-pressed={index === 0}
                  disabled={index > 0}
                  key={label}
                  title={
                    index > 0 ? "顶栏维度动作待接入,请用视图内维度切换" : "全部"
                  }
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <span className="workbench-toolbar-spacer" />
        <button
          className="workbench-action-button"
          onClick={() => onOpenPanel("snapshot")}
          type="button"
        >
          <Icon name="snapshot" />
          <span>快照</span>
        </button>
        <button
          className="workbench-action-button"
          onClick={() => onOpenPanel("exchange")}
          type="button"
        >
          <Icon name="exchange" />
          <span>导入</span>
        </button>
        <button
          className="workbench-action-button"
          onClick={() => onOpenPanel("review")}
          type="button"
        >
          <Icon name="review" />
          <span>批注</span>
        </button>
        <button
          className="workbench-action-button"
          onClick={() => onOpenPanel("ai")}
          type="button"
        >
          <Icon name="ai" />
          <span>AI 助手</span>
        </button>
        <button
          className="workbench-action-button"
          onClick={validateToolbarAction(onRevalidate, onToggleValidate)}
          type="button"
        >
          <Icon name="refresh" />
          <span>校验</span>
        </button>
        {documentOutputAction}
        <button
          className="workbench-action-button"
          onClick={onToggleAdvanced}
          type="button"
        >
          <Icon name="settings" />
          <span>视图设置</span>
        </button>
        <button
          className="workbench-action-button"
          onClick={onToggleTheme}
          type="button"
        >
          <Icon name="theme" />
          <span>{themeLabel}</span>
        </button>
      </div>
    </div>
  );
}

function Icon({ name }: { readonly name: string }): ReactElement {
  if (name === "search") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
    );
  }
  if (name === "cursor") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M3 2 12 7 8.4 8.1 10 12 8.4 12.7 6.6 8.8 4 11Z" />
      </svg>
    );
  }
  if (name === "link") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M5.8 6.4 4.4 7.8a2.3 2.3 0 1 0 3.3 3.3l1.2-1.2" />
        <path d="m7.1 6.1 1.2-1.2a2.3 2.3 0 0 1 3.3 3.3l-1.4 1.4" />
        <path d="M6.5 9.5 9.5 6.5" />
      </svg>
    );
  }
  if (name === "layout") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <rect height="4" rx="1" width="5" x="2" y="3" />
        <rect height="4" rx="1" width="5" x="9" y="9" />
        <path d="M4.5 7v3h4M11.5 9V6h-4" />
      </svg>
    );
  }
  if (name === "refresh") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M13 8a5 5 0 1 1-1.4-3.5" />
        <path d="M13 2v3h-3" />
      </svg>
    );
  }
  if (name === "ai") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M8 2.5 9.3 5 12 6.2 9.3 7.4 8 10 6.7 7.4 4 6.2 6.7 5Z" />
        <path d="M4 10.5 4.8 12 6.5 12.8 4.8 13.5 4 15 3.2 13.5 1.5 12.8 3.2 12Z" />
        <path d="M12.2 10.2 13 11.7 14.5 12.5 13 13.2 12.2 14.8 11.5 13.2 10 12.5 11.5 11.7Z" />
      </svg>
    );
  }
  if (name === "review") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M3 3h10v7H7l-3 3v-3H3Z" />
        <path d="M5.5 5.5h5M5.5 7.5h3" />
      </svg>
    );
  }
  if (name === "exchange") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M3 5h7M7.5 2.5 10 5 7.5 7.5" />
        <path d="M13 11H6M8.5 8.5 6 11l2.5 2.5" />
      </svg>
    );
  }
  if (name === "snapshot") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M4 3h8v9H4Z" />
        <path d="M6 6h4M6 8h4M6 10h2" />
        <path d="M3 5H2v9h8v-1" />
      </svg>
    );
  }
  if (name === "settings") {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 2.5v2M8 11.5v2M13.5 8h-2M4.5 8h-2M11.9 4.1l-1.4 1.4M5.5 10.5l-1.4 1.4M11.9 11.9l-1.4-1.4M5.5 5.5 4.1 4.1" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M8 2v2M8 12v2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M2 8h2M12 8h2M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" />
      <circle cx="8" cy="8" r="2.5" />
    </svg>
  );
}
