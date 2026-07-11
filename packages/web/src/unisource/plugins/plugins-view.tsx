import { useMemo, useState } from "react";

import { UsButton, UsInput, UsMonoTag, pushToast } from "../primitives";
import { useSessionSnapshot } from "../state/session-store";
import { workspaceStore, useWorkspaceSnapshot } from "../state/workspace-store";
import { PluginCard } from "./plugin-card";
import { PluginDetail } from "./plugin-detail";
import {
  PLUGIN_INDUSTRIES,
  buildPluginsViewModel,
  type PluginStatusFilter,
} from "./plugins-view-model";

export function PluginsView() {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PluginStatusFilter>("all");
  const [industry, setIndustry] = useState<
    (typeof PLUGIN_INDUSTRIES)[number] | "all"
  >("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const vm = useMemo(
    () =>
      buildPluginsViewModel(workspace, { query, status, industry, selectedId }),
    [workspace, query, status, industry, selectedId],
  );
  const selectedIdOrNull = vm.selected?.id ?? null;

  const install = (pluginId: string) => {
    workspaceStore.setPluginState(
      pluginId,
      { installed: true, enabled: true },
      session.currentMemberId,
    );
    pushToast({ title: "插件已安装并启用" });
  };
  const disable = (pluginId: string) => {
    workspaceStore.setPluginState(
      pluginId,
      { enabled: false },
      session.currentMemberId,
    );
    pushToast({
      title: "插件已停用",
      desc: "停用不删除数据,已挂载形式将置灰。",
    });
  };
  const update = (pluginId: string, version: string | null) => {
    if (!version) return;
    workspaceStore.setPluginState(
      pluginId,
      { version, updateTo: null },
      session.currentMemberId,
    );
    pushToast({ title: `已更新到 v${version}` });
  };
  const scope = (pluginId: string, next: "all" | "group") => {
    workspaceStore.setPluginState(
      pluginId,
      { scope: next },
      session.currentMemberId,
    );
    pushToast({
      title: next === "all" ? "已设为全部空间可用" : "已限定到产品中心",
    });
  };

  return (
    <section className="us-plugins-page">
      <header className="us-plugins-toolbar">
        <UsInput
          aria-label="搜索插件"
          kind="search"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="搜索插件 / 描述形式…"
          value={query}
        />
        <UsButton onClick={() => pushToast({ title: "开发者文档留待正式版" })}>
          开发者文档
        </UsButton>
        <UsButton
          onClick={() => pushToast({ title: "提交插件留待正式版" })}
          variant="emphasis"
        >
          提交插件
        </UsButton>
      </header>
      <div className="us-plugins-layout">
        <aside className="us-plugins-nav">
          <NavButton
            active={status === "all"}
            count={vm.counts.all}
            label="全部插件"
            onClick={() => setStatus("all")}
          />
          <NavButton
            active={status === "enabled"}
            count={vm.counts.enabled}
            label="已启用"
            onClick={() => setStatus("enabled")}
          />
          <NavButton
            active={status === "updates"}
            count={vm.counts.updates}
            label="有更新"
            onClick={() => setStatus("updates")}
          />
          <span className="us-plugins-nav__kicker">按行业 · INDUSTRY</span>
          <NavButton
            active={industry === "all"}
            count={vm.counts.all}
            label="全部行业"
            onClick={() => setIndustry("all")}
          />
          {vm.counts.industries.map((item) => (
            <NavButton
              active={industry === item.industry}
              count={item.count}
              key={item.industry}
              label={item.industry}
              onClick={() => setIndustry(item.industry)}
            />
          ))}
          <p>插件 = 行业表达形式包。数据不动,换一套『怎么描述』。</p>
        </aside>
        <main className="us-plugins-list">
          {vm.cards.map((card) => (
            <PluginCard
              card={card}
              key={card.id}
              onInstall={() => install(card.id)}
              onSelect={() => setSelectedId(card.id)}
              onUpdate={() => update(card.id, card.updateTo)}
            />
          ))}
          {vm.cards.length === 0 ? <p>没有匹配的插件。</p> : null}
          <footer>
            <UsMonoTag active>LIVE</UsMonoTag>
            安装的描述形式出现在每个表达的『添加形式』菜单;同一数据源,不同行业各说各的话。
          </footer>
        </main>
        <PluginDetail
          detail={vm.selected}
          onDisable={() => {
            if (selectedIdOrNull) disable(selectedIdOrNull);
          }}
          onInstall={() => {
            if (selectedIdOrNull) install(selectedIdOrNull);
          }}
          onScope={(next) => {
            if (selectedIdOrNull) scope(selectedIdOrNull, next);
          }}
          onUpdate={() => {
            if (vm.selected) update(vm.selected.id, vm.selected.updateTo);
          }}
        />
      </div>
    </section>
  );
}

function NavButton({
  active,
  count,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly count: number;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button aria-pressed={active} onClick={onClick} type="button">
      <span>{label}</span>
      <b className="us-data">{count}</b>
    </button>
  );
}
