import type { ReactNode } from "react";

import { UsButton, UsMonoTag } from "../primitives";
import type { PluginDetailVm } from "./plugins-view-model";

export function PluginDetail({
  detail,
  onDisable,
  onEnable,
  onInstall,
  onScope,
  onUpdate,
}: {
  readonly detail: PluginDetailVm | null;
  readonly onDisable: () => void;
  readonly onEnable: () => void;
  readonly onInstall: () => void;
  readonly onScope: (scope: PluginDetailVm["scope"]) => void;
  readonly onUpdate: () => void;
}) {
  if (!detail) {
    return (
      <aside className="us-plugin-detail">
        <p>没有匹配的插件。</p>
      </aside>
    );
  }
  return (
    <aside className="us-plugin-detail">
      <header>
        <h2>{detail.name}</h2>
        <span className="us-data">
          v{detail.version} · {detail.vendor} · {detail.industry}
        </span>
        {detail.updateTo ? (
          <button type="button" onClick={onUpdate}>
            更新 v{detail.updateTo}
          </button>
        ) : null}
      </header>

      <Section title="提供的描述形式" kicker="FORMS">
        <div className="us-plugin-detail__forms">
          {detail.forms.map((form) => (
            <span key={form.code}>
              <strong>{form.name}</strong>
              <small>{form.desc}</small>
            </span>
          ))}
        </div>
      </Section>

      <Section title="数据契约" kicker="CONTRACT">
        <dl className="us-plugin-contract">
          <dt>读取</dt>
          <dd className="us-data">{detail.contract.reads.join(" / ")}</dd>
          <dt>写回</dt>
          <dd className="us-data">
            {detail.contract.writes.length > 0
              ? detail.contract.writes.join(" / ")
              : "无"}
            {detail.contract.writeNote ? (
              <small>{detail.contract.writeNote}</small>
            ) : null}
          </dd>
        </dl>
      </Section>

      <Section title="启用范围" kicker="SCOPE">
        <div className="us-plugin-scope" role="group" aria-label="启用范围">
          <button
            aria-pressed={detail.scope === "all"}
            onClick={() => onScope("all")}
            type="button"
          >
            全部空间可用
          </button>
          <button
            aria-pressed={detail.scope === "group"}
            onClick={() => onScope("group")}
            type="button"
          >
            仅 {detail.scopeGroupLabel}
          </button>
        </div>
      </Section>

      <div className="us-plugin-actions">
        {detail.enabled ? (
          <UsButton onClick={onDisable} variant="secondary">
            停用
          </UsButton>
        ) : detail.installed ? (
          <UsButton onClick={onEnable} variant="primary">
            启用
          </UsButton>
        ) : (
          <UsButton onClick={onInstall} variant="primary">
            安装
          </UsButton>
        )}
        {detail.updateTo ? (
          <UsButton onClick={onUpdate} variant="emphasis">
            更新到 v{detail.updateTo}
          </UsButton>
        ) : null}
      </div>

      <footer>
        <UsMonoTag>{detail.usedByNames.length} USES</UsMonoTag>
        {detail.usedByNames.length > 0
          ? `被 ${detail.usedByNames.join("、")} 使用。停用不删数据,形式标签将置灰。`
          : "尚未被表达使用。"}
      </footer>
    </aside>
  );
}

function Section({
  children,
  kicker,
  title,
}: {
  readonly children: ReactNode;
  readonly kicker: string;
  readonly title: string;
}) {
  return (
    <section className="us-plugin-detail__section">
      <h3>
        {title} <span className="us-data">· {kicker}</span>
      </h3>
      {children}
    </section>
  );
}
