import type { CanvasAlignCommand, CanvasSizeCommand } from "./align";

export function AlignToolbar({
  canEdit,
  count,
  onAlign,
  onRemove,
  onSize,
}: {
  readonly canEdit: boolean;
  readonly count: number;
  readonly onAlign: (command: CanvasAlignCommand) => void;
  readonly onSize: (command: CanvasSizeCommand) => void;
  readonly onRemove: () => void;
}) {
  if (count < 2) return null;
  return (
    <div className="us-aligntb" role="toolbar" aria-label="对齐工具">
      <ToolbarButton
        disabled={!canEdit}
        label="左"
        onClick={() => onAlign("left")}
      />
      <ToolbarButton
        disabled={!canEdit}
        label="右"
        onClick={() => onAlign("right")}
      />
      <ToolbarButton
        disabled={!canEdit}
        label="顶"
        onClick={() => onAlign("top")}
      />
      <ToolbarButton
        disabled={!canEdit}
        label="居中"
        onClick={() => onAlign("horizontalCenter")}
      />
      <span />
      <ToolbarButton
        disabled={!canEdit}
        label="等宽"
        onClick={() => onSize("sameWidth")}
      />
      <ToolbarButton
        disabled={!canEdit}
        label="等高"
        onClick={() => onSize("sameHeight")}
      />
      <ToolbarButton
        disabled={!canEdit}
        label="等大"
        onClick={() => onSize("sameSize")}
      />
      <span />
      <ToolbarButton
        danger
        disabled={!canEdit}
        label="移除"
        onClick={onRemove}
      />
    </div>
  );
}

function ToolbarButton({
  danger,
  disabled,
  label,
  onClick,
}: {
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      data-danger={danger}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <b>□</b>
      <small>{label}</small>
    </button>
  );
}
