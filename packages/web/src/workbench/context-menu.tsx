import type { CSSProperties, ReactElement } from "react";

export type DiagramMenuContext =
  | { readonly kind: "edge"; readonly edgeId: string }
  | { readonly kind: "node"; readonly nodeId: string }
  | { readonly kind: "pane" };

export interface DiagramContextMenuState {
  readonly context: DiagramMenuContext;
  readonly x: number;
  readonly y: number;
}

export interface DiagramContextMenuProps {
  readonly canPaste: boolean;
  readonly menu: DiagramContextMenuState;
  readonly onClose: () => void;
  readonly onCopy: () => void;
  readonly onCreateObject: () => void;
  readonly onDelete: () => void;
  readonly onDuplicate: () => void;
  readonly onPaste: () => void;
  readonly onSelectAll: () => void;
  readonly onViewDetail: () => void;
}

const menuStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #9aa6b2",
  borderRadius: 6,
  boxShadow: "0 10px 28px rgb(25 36 54 / 18%)",
  display: "grid",
  gap: 2,
  minWidth: 156,
  padding: 6,
  position: "fixed",
  zIndex: 20,
};

const buttonStyle: CSSProperties = {
  background: "transparent",
  border: 0,
  borderRadius: 4,
  color: "#18212f",
  cursor: "pointer",
  padding: "0.42rem 0.55rem",
  textAlign: "left",
};

export function DiagramContextMenu({
  canPaste,
  menu,
  onClose,
  onCopy,
  onCreateObject,
  onDelete,
  onDuplicate,
  onPaste,
  onSelectAll,
  onViewDetail,
}: DiagramContextMenuProps): ReactElement {
  const style = { ...menuStyle, left: menu.x, top: menu.y };
  return (
    <div aria-label="图面板右键菜单" role="menu" style={style}>
      {menu.context.kind === "node" ? (
        <NodeItems
          onCopy={onCopy}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onViewDetail={onViewDetail}
        />
      ) : menu.context.kind === "edge" ? (
        <MenuButton label="删除关系" onClick={onDelete} />
      ) : (
        <>
          <MenuButton label="粘贴" onClick={onPaste} disabled={!canPaste} />
          <MenuButton label="新建对象" onClick={onCreateObject} />
          <MenuButton label="全选" onClick={onSelectAll} />
        </>
      )}
      <MenuButton label="关闭" onClick={onClose} />
    </div>
  );
}

function NodeItems({
  onCopy,
  onDelete,
  onDuplicate,
  onViewDetail,
}: Pick<
  DiagramContextMenuProps,
  "onCopy" | "onDelete" | "onDuplicate" | "onViewDetail"
>): ReactElement {
  return (
    <>
      <MenuButton label="删除" onClick={onDelete} />
      <MenuButton label="再制" onClick={onDuplicate} />
      <MenuButton label="复制" onClick={onCopy} />
      <MenuButton label="查看详情" onClick={onViewDetail} />
    </>
  );
}

function MenuButton({
  disabled = false,
  label,
  onClick,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      style={buttonStyle}
      type="button"
    >
      {label}
    </button>
  );
}
