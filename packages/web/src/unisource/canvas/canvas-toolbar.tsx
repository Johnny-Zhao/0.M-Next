import { UsButton } from "../primitives";

export function CanvasToolbar({
  addOpen,
  canEdit,
  connectMode,
  onAdd,
  onRun,
  onSelect,
  onToggleConnect,
}: {
  readonly addOpen: boolean;
  readonly canEdit: boolean;
  readonly connectMode: boolean;
  readonly onAdd: () => void;
  readonly onRun: () => void;
  readonly onSelect?: () => void;
  readonly onToggleConnect: () => void;
}) {
  return (
    <div className="us-canvas-toolbar">
      <UsButton
        disabled={!canEdit}
        onClick={onSelect}
        size="sm"
        variant={connectMode ? "secondary" : "primary"}
      >
        选择
      </UsButton>
      <UsButton
        disabled={!canEdit}
        onClick={onToggleConnect}
        size="sm"
        variant={connectMode ? "primary" : "secondary"}
      >
        连线
      </UsButton>
      <UsButton
        disabled={!canEdit}
        onClick={onAdd}
        size="sm"
        variant={addOpen ? "primary" : "secondary"}
      >
        从数据源添加
      </UsButton>
      <UsButton onClick={onRun} size="sm" variant="ghost">
        运行
      </UsButton>
    </div>
  );
}
