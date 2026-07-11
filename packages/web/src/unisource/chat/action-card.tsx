import type { ActionCard } from "../state/chat-store";
import { UsDiffBadge, UsMonoTag } from "../primitives";

export function ActionCardView({ card }: { readonly card: ActionCard }) {
  return (
    <article
      className="us-actioncard"
      data-kind={card.kind}
      data-status={card.status}
    >
      <header>
        <UsDiffBadge op={card.kind === "add" ? "add" : "change"} />
        <strong>{card.title}</strong>
        <UsMonoTag
          tone={
            card.status === "pending"
              ? "change"
              : card.status === "undone"
                ? "danger"
                : "primary"
          }
        >
          {card.status === "pending"
            ? "待王芸批准"
            : card.status === "undone"
              ? "已撤销"
              : "已应用"}
        </UsMonoTag>
      </header>
      <p>{card.target}</p>
      <b className="us-data">{card.diff}</b>
      <small>{card.impact}</small>
    </article>
  );
}
