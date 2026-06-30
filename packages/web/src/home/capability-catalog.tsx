import { useEffect, useMemo, useState, type ReactElement } from "react";

import type {
  CommandClient,
  TemplateCatalogItem,
  TemplateTypeOverview,
  ViewClient,
} from "@m-next/views";

export type CapabilityFacet = "industry" | "profession" | "scenario";

export type CapabilityFacetSelection = Readonly<
  Record<CapabilityFacet, readonly string[]>
>;

const FACETS: readonly {
  readonly key: CapabilityFacet;
  readonly label: string;
}[] = [
  { key: "industry", label: "行业" },
  { key: "profession", label: "专业" },
  { key: "scenario", label: "场景" },
];

const EMPTY_FACETS: CapabilityFacetSelection = {
  industry: [],
  profession: [],
  scenario: [],
};

export function filterCapabilities(
  templates: readonly TemplateCatalogItem[],
  query: string,
  facets: CapabilityFacetSelection = EMPTY_FACETS,
): readonly TemplateCatalogItem[] {
  const normalized = query.trim().toLowerCase();
  return templates.filter(
    (template) =>
      matchesQuery(template, normalized) && matchesFacets(template, facets),
  );
}

export function facetOptions(
  templates: readonly TemplateCatalogItem[],
  facet: CapabilityFacet,
): readonly string[] {
  return Array.from(
    new Set(templates.flatMap((template) => tagValues(template, facet))),
  ).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

export function tagValues(
  template: TemplateCatalogItem,
  facet: CapabilityFacet,
): readonly string[] {
  const values = template.tags?.[facet] ?? [];
  return values.length > 0 ? values : ["未分类"];
}

function matchesQuery(template: TemplateCatalogItem, normalized: string) {
  return (
    !normalized ||
    `${template.name} ${template.code}`.toLowerCase().includes(normalized)
  );
}

function matchesFacets(
  template: TemplateCatalogItem,
  facets: CapabilityFacetSelection,
) {
  return FACETS.every(({ key }) => {
    const selected = facets[key];
    return (
      selected.length === 0 ||
      tagValues(template, key).some((tag) => selected.includes(tag))
    );
  });
}

export function isPublished(template: TemplateCatalogItem): boolean {
  return Boolean(template.publishedAt) && template.latestPublishedVersion > 0;
}

export function versionLabel(template: TemplateCatalogItem): string {
  return isPublished(template)
    ? `v${template.latestPublishedVersion}`
    : "未发布";
}

export function publishedLabel(template: TemplateCatalogItem): string {
  if (!template.publishedAt) return "未发布";
  const date = new Date(template.publishedAt);
  if (Number.isNaN(date.getTime())) return "未发布";
  return `发布 ${date.toLocaleDateString("zh-CN")}`;
}

export function visibleTypeOverview(
  types: readonly TemplateTypeOverview[],
): readonly TemplateTypeOverview[] {
  return types.slice(0, 4);
}

export function hiddenTypeCount(template: TemplateCatalogItem): number {
  const hidden = Math.max(0, template.typeOverview.length - 4);
  return template.typeOverviewTruncated ? Math.max(1, hidden) : hidden;
}

export interface CapabilityCatalogProps {
  readonly commandClient: CommandClient;
  readonly viewClient: ViewClient;
  readonly onCreated: () => void;
  readonly reportError: (message: string) => void;
}

export function CapabilityCatalog({
  commandClient,
  onCreated,
  reportError,
  viewClient,
}: CapabilityCatalogProps): ReactElement {
  const [templates, setTemplates] = useState<readonly TemplateCatalogItem[]>(
    [],
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [selectedFacets, setSelectedFacets] =
    useState<CapabilityFacetSelection>(EMPTY_FACETS);
  const [draft, setDraft] = useState<{
    readonly template: TemplateCatalogItem;
    readonly name: string;
  } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setLoadFailed(false);
    void viewClient
      .templates()
      .then((items) => {
        if (disposed) return;
        setTemplates(items);
      })
      .catch((error) => {
        if (disposed) return;
        setLoadFailed(true);
        reportError(
          error instanceof Error ? error.message : "读取能力目录失败",
        );
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [reportError, viewClient]);

  const filteredTemplates = useMemo(
    () => filterCapabilities(templates, query, selectedFacets),
    [query, selectedFacets, templates],
  );

  const options = useMemo(
    () =>
      Object.fromEntries(
        FACETS.map(({ key }) => [key, facetOptions(templates, key)]),
      ) as Record<CapabilityFacet, readonly string[]>,
    [templates],
  );

  function toggleFacet(facet: CapabilityFacet, value: string): void {
    setSelectedFacets((current) => {
      const selected = current[facet];
      const next = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];
      return { ...current, [facet]: next };
    });
  }

  async function instantiate(): Promise<void> {
    if (!draft || !isPublished(draft.template) || !draft.name.trim()) return;
    setCreatingId(draft.template.templateId);
    try {
      await commandClient.instantiateWorkspace(
        crypto.randomUUID(),
        draft.template.templateId,
        draft.template.latestPublishedVersion,
        draft.name.trim(),
      );
      setDraft(null);
      onCreated();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "创建项目失败");
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <section className="home-shell capability-catalog" aria-label="能力目录">
      <header className="home-header">
        <div>
          <strong>能力目录</strong>
          <h1>即需即装</h1>
          <p>浏览已发布领域模板,用需要的能力直接开项目。</p>
        </div>
      </header>
      <label className="project-search capability-search">
        搜索能力
        <input
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="按名称或 code"
          value={query}
        />
      </label>
      <div className="capability-facets" aria-label="能力标签筛选">
        {FACETS.map(({ key, label }) => (
          <div className="capability-facet" key={key}>
            <span>{label}</span>
            <div>
              {options[key].map((value) => (
                <button
                  aria-pressed={selectedFacets[key].includes(value)}
                  className={
                    selectedFacets[key].includes(value) ? "is-selected" : ""
                  }
                  key={value}
                  onClick={() => toggleFacet(key, value)}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {loading ? (
        <CapabilitySkeleton />
      ) : filteredTemplates.length === 0 ? (
        <div className="empty-projects">
          <h2>暂无可用能力模板</h2>
          <p>{loadFailed ? "能力目录读取失败。" : "换个名称或 code 再试。"}</p>
        </div>
      ) : (
        <div className="capability-grid">
          {filteredTemplates.map((template) => (
            <CapabilityCard
              creating={creatingId === template.templateId}
              key={template.templateId}
              onUse={() =>
                setDraft({
                  template,
                  name: `${template.name} 项目`,
                })
              }
              template={template}
            />
          ))}
        </div>
      )}
      {draft ? (
        <form
          className="capability-create"
          onSubmit={(event) => {
            event.preventDefault();
            void instantiate();
          }}
        >
          <label>
            项目名称
            <input
              autoFocus
              onChange={(event) =>
                setDraft({ ...draft, name: event.currentTarget.value })
              }
              value={draft.name}
            />
          </label>
          <div>
            <button onClick={() => setDraft(null)} type="button">
              取消
            </button>
            <button
              disabled={!draft.name.trim() || creatingId !== null}
              type="submit"
            >
              {creatingId ? "创建中..." : "创建项目"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function CapabilityCard({
  creating,
  onUse,
  template,
}: {
  readonly creating: boolean;
  readonly onUse: () => void;
  readonly template: TemplateCatalogItem;
}): ReactElement {
  const disabled = !isPublished(template) || creating;
  const moreCount = hiddenTypeCount(template);
  return (
    <article className="capability-card">
      <div className="capability-card-head">
        <div>
          <strong>{template.name}</strong>
          <code>{template.code}</code>
        </div>
        <span
          className={
            isPublished(template)
              ? "capability-version"
              : "capability-version capability-unpublished"
          }
        >
          {versionLabel(template)}
        </span>
      </div>
      <p>{template.description || "暂无描述"}</p>
      <div className="capability-types" aria-label="对象类型">
        {visibleTypeOverview(template.typeOverview).map((type) => (
          <span key={type.code} title={type.code}>
            {type.name || type.code}
          </span>
        ))}
        {moreCount > 0 ? <span>+{moreCount} 更多</span> : null}
      </div>
      <footer>
        <span>{publishedLabel(template)}</span>
        <button
          disabled={disabled}
          onClick={onUse}
          title={isPublished(template) ? undefined : "模板未发布,暂不可用"}
          type="button"
        >
          {creating ? "创建中..." : "用此能力新建项目"}
        </button>
      </footer>
    </article>
  );
}

function CapabilitySkeleton(): ReactElement {
  return (
    <div className="capability-grid" aria-label="能力目录加载中">
      {[0, 1, 2].map((item) => (
        <div className="capability-card capability-skeleton" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
