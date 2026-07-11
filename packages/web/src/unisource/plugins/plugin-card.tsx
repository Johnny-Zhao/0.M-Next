import { UsButton, UsMonoTag } from "../primitives";
import type { PluginCardVm } from "./plugins-view-model";

export function PluginCard({
  card,
  onInstall,
  onSelect,
  onUpdate,
}: {
  readonly card: PluginCardVm;
  readonly onInstall: () => void;
  readonly onSelect: () => void;
  readonly onUpdate: () => void;
}) {
  return (
    <article
      className="us-plugin-card"
      data-selected={card.selected || undefined}
      onClick={onSelect}
    >
      <header>
        <span>
          <strong>{card.name}</strong>
          <small className="us-data">{card.meta}</small>
        </span>
        {!card.installed ? (
          <UsButton
            onClick={(event) => {
              event.stopPropagation();
              onInstall();
            }}
            size="sm"
            variant="primary"
          >
            安装
          </UsButton>
        ) : null}
      </header>
      <p>{card.tagline}</p>
      <footer>
        {card.enabled ? (
          <UsMonoTag tone="primary">已启用</UsMonoTag>
        ) : (
          <UsMonoTag>未启用</UsMonoTag>
        )}
        <UsMonoTag>{card.industry}</UsMonoTag>
        <UsMonoTag>{card.formsCount} FORMS</UsMonoTag>
        {card.updateTo ? (
          <button
            className="us-plugin-card__update"
            onClick={(event) => {
              event.stopPropagation();
              onUpdate();
            }}
            type="button"
          >
            可更新 v{card.updateTo}
          </button>
        ) : null}
        {card.beta ? <UsMonoTag tone="change">BETA</UsMonoTag> : null}
      </footer>
    </article>
  );
}
