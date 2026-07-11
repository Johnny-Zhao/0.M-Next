import type { MatrixCardVm } from "./matrix-view-model";

export function MatrixRecordCard({
  canDrag,
  card,
  onClick,
  onDragStart,
}: {
  readonly canDrag: boolean;
  readonly card: MatrixCardVm;
  readonly onClick: () => void;
  readonly onDragStart: () => void;
}) {
  return (
    <article
      className="us-matrix-card"
      data-dim={card.dim}
      draggable={canDrag}
      onClick={onClick}
      onDragStart={(event) => {
        if (!canDrag) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/plain", card.objectId);
        onDragStart();
      }}
    >
      <strong>{card.name}</strong>
      <span className="us-data">{card.priceText}</span>
      <small className="us-data">{card.docRefs} DOC</small>
    </article>
  );
}
