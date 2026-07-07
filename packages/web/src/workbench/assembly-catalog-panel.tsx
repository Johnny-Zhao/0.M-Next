import { useEffect, useMemo, useState, type ReactElement } from "react";

import type { ReusableAssembly, ViewClient, ViewObject } from "@m-next/views";

import {
  objectDisplayTitle,
  objectTypeLabel,
  templateLabel,
} from "../display-labels";
import { useToast } from "../toast";
import { useWorkbenchContext } from "./workbench";

interface UsageItem {
  readonly objectId: string;
  readonly objectType: string;
  readonly label: string;
}

interface PlaceDraft {
  readonly placementKey: string;
  readonly name: string;
  readonly paramsJson: string;
}

export function filterAssemblies(
  assemblies: readonly ReusableAssembly[],
  query: string,
  profile: string,
): readonly ReusableAssembly[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedProfile = profile.trim().toLowerCase();
  return assemblies.filter((assembly) => {
    const matchesQuery =
      normalizedQuery === "" ||
      assembly.name.toLowerCase().includes(normalizedQuery);
    const matchesProfile =
      normalizedProfile === "" ||
      templateLabel(assembly.templateCode)
        .toLowerCase()
        .includes(normalizedProfile);
    return matchesQuery && matchesProfile;
  });
}

export function defaultPlaceName(assembly: ReusableAssembly): string {
  const paramName = assembly.params.name;
  return typeof paramName === "string" && paramName.trim() !== ""
    ? paramName
    : assembly.name;
}

export function parsePlacementParams(
  draft: PlaceDraft,
): Readonly<Record<string, unknown>> {
  const parsed =
    draft.paramsJson.trim() === ""
      ? {}
      : (JSON.parse(draft.paramsJson) as Record<string, unknown>);
  return { ...parsed, name: draft.name.trim() || "未命名装配" };
}

export function sourceRef(assembly: ReusableAssembly): string {
  return `assembly:${assembly.assemblyId}:v${assembly.version}`;
}

export function AssemblyCatalogPanel(): ReactElement {
  const {
    commandClient,
    refreshVersion,
    refreshViews,
    reportError,
    viewClient,
    workspaceId,
  } = useWorkbenchContext();
  const toast = useToast();
  const [assemblies, setAssemblies] = useState<readonly ReusableAssembly[]>([]);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PlaceDraft>>({});
  const [usage, setUsage] = useState<Record<string, readonly UsageItem[]>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void viewClient
      .reusableAssemblies(workspaceId, null, 0, 100)
      .then((page) => {
        if (cancelled) return;
        setAssemblies(page.items);
        setDrafts((current) => withDefaults(current, page.items));
      })
      .catch((error) =>
        reportError(
          error instanceof Error ? error.message : "读取装配目录失败",
        ),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion, reportError, viewClient, workspaceId]);

  const visible = useMemo(
    () => filterAssemblies(assemblies, query, profile),
    [assemblies, profile, query],
  );

  async function place(assembly: ReusableAssembly): Promise<void> {
    const draft = drafts[assembly.assemblyId] ?? createDraft(assembly);
    setPlacing(assembly.assemblyId);
    try {
      await commandClient.placeAssembly(
        workspaceId,
        assembly.assemblyId,
        assembly.version,
        {
          placementKey: draft.placementKey.trim(),
          params: parsePlacementParams(draft),
        },
      );
      refreshViews();
      toast.success("装配已放置并刷新视图");
      const items = await loadUsage(viewClient, workspaceId, assembly);
      setUsage((current) => ({ ...current, [assembly.assemblyId]: items }));
    } catch (error) {
      reportError(error instanceof Error ? error.message : "放置装配失败");
    } finally {
      setPlacing(null);
    }
  }

  return (
    <aside aria-label="装配目录" className="assembly-catalog-panel">
      <header className="assembly-catalog-header">
        <div>
          <strong>装配目录</strong>
          <span>可复用装配</span>
        </div>
        <span>{assemblies.length}</span>
      </header>
      <div className="assembly-catalog-filters">
        <label>
          名称
          <input
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="搜索装配"
            value={query}
          />
        </label>
        <label>
          模板
          <input
            onChange={(event) => setProfile(event.currentTarget.value)}
            placeholder="模板名称"
            value={profile}
          />
        </label>
      </div>
      {loading ? <AssemblySkeleton /> : null}
      {!loading && visible.length === 0 ? (
        <p className="assembly-empty">当前工作空间没有可放置装配。</p>
      ) : null}
      <div className="assembly-card-grid">
        {visible.map((assembly) => (
          <AssemblyCard
            assembly={assembly}
            draft={drafts[assembly.assemblyId] ?? createDraft(assembly)}
            key={assembly.assemblyId}
            onDraft={(draft) =>
              setDrafts((current) => ({
                ...current,
                [assembly.assemblyId]: draft,
              }))
            }
            onPlace={() => void place(assembly)}
            placing={placing === assembly.assemblyId}
            usage={usage[assembly.assemblyId] ?? []}
          />
        ))}
      </div>
    </aside>
  );
}

function AssemblyCard({
  assembly,
  draft,
  onDraft,
  onPlace,
  placing,
  usage,
}: {
  readonly assembly: ReusableAssembly;
  readonly draft: PlaceDraft;
  readonly onDraft: (draft: PlaceDraft) => void;
  readonly onPlace: () => void;
  readonly placing: boolean;
  readonly usage: readonly UsageItem[];
}): ReactElement {
  const validPlacementKey = draft.placementKey.trim().length > 0;
  return (
    <article className="assembly-card">
      <header>
        <div>
          <strong>{assembly.name}</strong>
          <span>
            {templateLabel(assembly.templateCode)} · 第 {assembly.version} 版
          </span>
        </div>
        <small>模板版本 {assembly.templateVersion}</small>
      </header>
      <div aria-label="对象类型" className="assembly-type-chips">
        {assembly.objectTypes.map((type) => (
          <span key={type}>{objectTypeLabel(type)}</span>
        ))}
      </div>
      <div className="assembly-place-form">
        <label>
          放置名称
          <input
            onChange={(event) =>
              onDraft({ ...draft, name: event.currentTarget.value })
            }
            value={draft.name}
          />
        </label>
        <label>
          放置标识
          <input
            onChange={(event) =>
              onDraft({ ...draft, placementKey: event.currentTarget.value })
            }
            value={draft.placementKey}
          />
        </label>
        <label>
          参数
          <textarea
            onChange={(event) =>
              onDraft({ ...draft, paramsJson: event.currentTarget.value })
            }
            spellCheck={false}
            value={draft.paramsJson}
          />
        </label>
      </div>
      <footer>
        <small>来源: 复用装配</small>
        <button
          disabled={placing || !validPlacementKey}
          onClick={onPlace}
          type="button"
        >
          {placing ? "放置中..." : "放置"}
        </button>
      </footer>
      {usage.length > 0 ? (
        <ul className="assembly-usage-list" aria-label="已放置来源">
          {usage.map((item) => (
            <li key={item.objectId}>
              <span>{item.label}</span>
              <small>{objectTypeLabel(item.objectType)}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function AssemblySkeleton(): ReactElement {
  return (
    <div aria-label="装配目录加载中" className="assembly-skeleton">
      <span />
      <span />
      <span />
    </div>
  );
}

function withDefaults(
  current: Record<string, PlaceDraft>,
  assemblies: readonly ReusableAssembly[],
): Record<string, PlaceDraft> {
  const next = { ...current };
  for (const assembly of assemblies) {
    next[assembly.assemblyId] ??= createDraft(assembly);
  }
  return next;
}

function createDraft(assembly: ReusableAssembly): PlaceDraft {
  return {
    placementKey: `${slug(assembly.name)}-${assembly.version}`,
    name: defaultPlaceName(assembly),
    paramsJson: JSON.stringify(assembly.params, null, 2),
  };
}

async function loadUsage(
  viewClient: Pick<ViewClient, "objects">,
  workspaceId: string,
  assembly: ReusableAssembly,
): Promise<readonly UsageItem[]> {
  const ref = sourceRef(assembly);
  const pages = await Promise.all(
    assembly.objectTypes.map((type) =>
      viewClient.objects(workspaceId, type, 0, 50),
    ),
  );
  return pages
    .flatMap((page) => page.items)
    .filter((object) => object.source === ref)
    .map((object) => usageItem(object));
}

function usageItem(object: ViewObject): UsageItem {
  return {
    objectId: object.objectId,
    objectType: object.objectType,
    label: labelOf(object),
  };
}

function labelOf(object: ViewObject): string {
  return objectDisplayTitle(object);
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "assembly"
  );
}
