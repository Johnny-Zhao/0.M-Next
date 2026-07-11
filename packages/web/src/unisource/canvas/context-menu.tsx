import type { GotoTargetVm } from "./canvas-view-model";

export function CanvasContextMenu({
  x,
  y,
  canEdit,
  gotoTargets,
  onGoto,
  onRemove,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  canEdit: boolean;
  gotoTargets: readonly GotoTargetVm[];
  onGoto: (target: GotoTargetVm) => void;
  onRemove: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="us-canvas-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label="画布右键菜单"
    >
      <div className="us-canvas-menu__group">
        <span>跳转</span>
        {gotoTargets.map((target) => (
          <button
            key={target.href}
            type="button"
            role="menuitem"
            onClick={() => onGoto(target)}
          >
            {target.label}
          </button>
        ))}
      </div>
      <div className="us-canvas-menu__group">
        <button
          type="button"
          role="menuitem"
          onClick={onRemove}
          disabled={!canEdit}
        >
          从视图移除
        </button>
        <button
          type="button"
          role="menuitem"
          className="us-canvas-menu__danger"
          onClick={onDelete}
          disabled={!canEdit}
        >
          删除数据源记录
        </button>
      </div>
      <button type="button" role="menuitem" onClick={onClose}>
        关闭
      </button>
    </div>
  );
}
