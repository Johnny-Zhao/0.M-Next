import type { PluginDef, PluginIndustry } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";

export const PLUGIN_INDUSTRIES: readonly PluginIndustry[] = [
  "制造业",
  "建筑工程",
  "医疗健康",
  "金融",
  "法务合规",
  "教育科研",
];

export type PluginStatusFilter = "all" | "enabled" | "updates";

export interface PluginFormOptionVm {
  readonly form: string;
  readonly label: string;
}

export interface PluginCountsVm {
  readonly all: number;
  readonly enabled: number;
  readonly updates: number;
  readonly industries: readonly {
    readonly industry: PluginIndustry;
    readonly count: number;
  }[];
}

export interface PluginCardVm {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly tagline: string;
  readonly industry: PluginIndustry;
  readonly formsCount: number;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly updateTo: string | null;
  readonly beta: boolean;
  readonly selected: boolean;
}

export interface PluginDetailVm extends PluginCardVm {
  readonly version: string;
  readonly vendor: string;
  readonly forms: PluginDef["formsProvided"];
  readonly contract: PluginDef["contract"];
  readonly scope: PluginDef["scope"];
  readonly scopeGroupLabel: string;
  readonly usedByNames: readonly string[];
}

export interface PluginsViewModel {
  readonly counts: PluginCountsVm;
  readonly cards: readonly PluginCardVm[];
  readonly selected: PluginDetailVm | null;
  readonly addFormOptions: readonly PluginFormOptionVm[];
}

export function buildPluginFormOptions(
  plugins: readonly PluginDef[],
): readonly PluginFormOptionVm[] {
  return plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      plugin.formsProvided.map((form) => ({
        form: `plugin:${plugin.id}:${form.code}`,
        label: `${plugin.name} · ${form.name}`,
      })),
    );
}

export function buildPluginsViewModel(
  state: WorkspaceState,
  params: {
    readonly query?: string;
    readonly status?: PluginStatusFilter;
    readonly industry?: PluginIndustry | "all";
    readonly selectedId?: string | null;
  } = {},
): PluginsViewModel {
  const query = normalize(params.query ?? "");
  const status = params.status ?? "all";
  const industry = params.industry ?? "all";
  const counts = deriveCounts(state.plugins);
  const filtered = state.plugins.filter((plugin) => {
    if (status === "enabled" && !plugin.enabled) return false;
    if (status === "updates" && !plugin.updateTo) return false;
    if (industry !== "all" && plugin.industry !== industry) return false;
    if (!query) return true;
    return searchableText(plugin).includes(query);
  });
  const selectedPlugin =
    filtered.find((plugin) => plugin.id === params.selectedId) ??
    filtered[0] ??
    null;
  return {
    counts,
    cards: filtered.map((plugin) => cardVm(plugin, selectedPlugin?.id)),
    selected: selectedPlugin ? detailVm(state, selectedPlugin) : null,
    addFormOptions: buildPluginFormOptions(state.plugins),
  };
}

function deriveCounts(plugins: readonly PluginDef[]): PluginCountsVm {
  return {
    all: plugins.length,
    enabled: plugins.filter((plugin) => plugin.enabled).length,
    updates: plugins.filter((plugin) => plugin.updateTo).length,
    industries: PLUGIN_INDUSTRIES.map((industry) => ({
      industry,
      count: plugins.filter((plugin) => plugin.industry === industry).length,
    })),
  };
}

function cardVm(
  plugin: PluginDef,
  selectedId: string | undefined,
): PluginCardVm {
  return {
    id: plugin.id,
    name: plugin.name,
    meta: `v${plugin.version} · ${plugin.vendor}`,
    tagline: plugin.tagline,
    industry: plugin.industry,
    formsCount: plugin.formsProvided.length,
    installed: plugin.installed,
    enabled: plugin.enabled,
    updateTo: plugin.updateTo ?? null,
    beta: plugin.beta ?? false,
    selected: plugin.id === selectedId,
  };
}

function detailVm(state: WorkspaceState, plugin: PluginDef): PluginDetailVm {
  const card = cardVm(plugin, plugin.id);
  const expressionById = new Map(
    state.expressions.map((expression) => [expression.id, expression.name]),
  );
  return {
    ...card,
    version: plugin.version,
    vendor: plugin.vendor,
    forms: plugin.formsProvided,
    contract: plugin.contract,
    scope: plugin.scope,
    scopeGroupLabel: plugin.scopeGroupLabel ?? "产品中心",
    usedByNames: plugin.usedByExprIds.map(
      (exprId) => expressionById.get(exprId) ?? exprId,
    ),
  };
}

function searchableText(plugin: PluginDef): string {
  return normalize(
    [
      plugin.name,
      plugin.vendor,
      plugin.industry,
      plugin.tagline,
      ...plugin.formsProvided.flatMap((form) => [form.name, form.desc]),
    ].join(" "),
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
