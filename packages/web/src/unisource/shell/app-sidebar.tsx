import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { buildDataCatalogTree } from "../data/data-catalog-tree-model";
import { filterDataCatalogTree } from "../data/data-catalog-search-model";
import { useKernelRuntimeState } from "../data/boot-mode";
import { ExpressionCreateTrigger } from "../expression/expression-create-trigger";
import { UsInput, UsSegmented } from "../primitives";
import { usPaths } from "../routes-paths";
import {
  dataCatalogStore,
  useDataCatalogSnapshot,
} from "../state/data-catalog-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { UsDataCatalogTree } from "../ui/us-data-catalog-tree";
import {
  dataCatalogLibraryPath,
  dataCatalogRecordPath,
  EMPTY_DATA_CATALOG_EXPANDED_STATE,
  EMPTY_DATA_CATALOG_SIDEBAR_SEARCH,
  focusObjectIdFromDataCatalogSearch,
  loadCatalogRecordsForSidebar,
  loadDataCatalogForSidebar,
  loadMoreCatalogRecordsForSidebar,
  mergeCatalogExpandedKeys,
  reconcileDataCatalogExpandedKeys,
  resetDataCatalogSearchForWorkspace,
  retryCatalogRecordsForSidebar,
  resolveVisibleCatalogExpandedKeys,
  resolveDataCatalogSidebar,
  sourceIdFromDataCatalogPath,
  type DataCatalogSidebarTab,
  updateDataCatalogSidebarSearch,
} from "./data-catalog-sidebar-model";
import { UsLogo } from "./logo";

type SidebarTab = DataCatalogSidebarTab;

const FOOTNOTES: Record<SidebarTab, string> = {
  what: "表达 = 一次「要说的事」。右侧标注它已挂的描述形式。",
  data: "数据只有一份本源;表格只是打开库时的默认描述形式,可随时换。",
};

const EMPTY_CATALOG_TREE = { nodes: [], selectedKeys: [], expandedKeys: [] };

/**
 * AppSidebar 264px(交接规格 §02):
 * Logo + HomeLink + SidebarTabs(WHAT/DATA 互斥)+ SearchInput + 列表区 + 脚注。
 * P0 为静态导航骨架;P1 起由 store 驱动、数据树支持层级/徽标/拖拽。
 */
export function AppSidebar({
  defaultTab = "what",
}: {
  defaultTab?: SidebarTab;
}) {
  const [tab, setTab] = useState<SidebarTab>(defaultTab);
  const [catalogExpandedState, setCatalogExpandedState] = useState(
    EMPTY_DATA_CATALOG_EXPANDED_STATE,
  );
  const [search, setSearch] = useState(EMPTY_DATA_CATALOG_SIDEBAR_SEARCH);
  const snapshot = useWorkspaceSnapshot();
  const catalogState = useDataCatalogSnapshot();
  const runtime = useKernelRuntimeState();
  const location = useLocation();
  const navigate = useNavigate();
  const currentExprId = location.pathname.match(/\/expr\/([^/?]+)/)?.[1];
  const currentExpr = snapshot.expressions.find(
    (expression) => expression.id === currentExprId,
  );
  const currentForm = new URLSearchParams(location.search).get("form");
  const runOpen = new URLSearchParams(location.search).get("run") === "1";
  const activeSpace = currentExpr?.space === "workshop" ? "workshop" : "main";
  const visibleExpressions = snapshot.expressions.filter((expression) =>
    activeSpace === "workshop"
      ? expression.space === "workshop"
      : (expression.space ?? "main") === "main",
  );
  const usedTemplateIds = new Set(
    snapshot.slotBindings
      .filter((binding) =>
        activeSpace === "workshop"
          ? visibleExpressions.some((expr) => expr.id === binding.exprId)
          : false,
      )
      .map((binding) => binding.templateId),
  );
  const currentSourceId = sourceIdFromDataCatalogPath(location.pathname);
  const focusObjectId = focusObjectIdFromDataCatalogSearch(location.search);
  const catalogSidebar = resolveDataCatalogSidebar(
    tab,
    snapshot.workspace.id,
    catalogState,
  );
  const catalogTree = useMemo(
    () =>
      catalogSidebar.catalog
        ? buildDataCatalogTree({
            catalog: catalogSidebar.catalog,
            objectTypes: snapshot.objectTypes,
            sourceId: currentSourceId,
            records: catalogSidebar.records,
            focusObjectId,
          })
        : EMPTY_CATALOG_TREE,
    [
      catalogSidebar.catalog,
      catalogSidebar.records,
      currentSourceId,
      focusObjectId,
      snapshot.objectTypes,
    ],
  );
  const catalogSearch = useMemo(
    () => filterDataCatalogTree(catalogTree.nodes, search.data),
    [catalogTree.nodes, search.data],
  );
  const automaticCatalogExpandedKeys = useMemo(
    () =>
      mergeCatalogExpandedKeys(
        catalogTree.expandedKeys,
        catalogSearch.automaticExpandedKeys,
      ),
    [catalogSearch.automaticExpandedKeys, catalogTree.expandedKeys],
  );
  const visibleCatalogExpandedKeys = useMemo(
    () =>
      resolveVisibleCatalogExpandedKeys(
        catalogExpandedState,
        automaticCatalogExpandedKeys,
      ),
    [automaticCatalogExpandedKeys, catalogExpandedState],
  );

  useEffect(() => {
    if (defaultTab === "data") setTab("data");
  }, [defaultTab]);

  useEffect(() => {
    dataCatalogStore.activate(snapshot.workspace.id);
    setCatalogExpandedState(EMPTY_DATA_CATALOG_EXPANDED_STATE);
    setSearch((current) => resetDataCatalogSearchForWorkspace(current));
  }, [snapshot.workspace.id]);

  useEffect(() => {
    void loadDataCatalogForSidebar(
      catalogSidebar.shouldLoadCatalog,
      snapshot.workspace.id,
      runtime.catalogGateway,
      dataCatalogStore,
    );
  }, [
    catalogSidebar.shouldLoadCatalog,
    runtime.catalogGateway,
    snapshot.workspace.id,
  ]);

  return (
    <nav className="us-sidebar" aria-label="侧栏导航">
      <div className="us-sidebar__top">
        <UsLogo />
        <NavLink to={usPaths.home} className="us-sidebar__home" end>
          首页总览
          <span className="us-sidebar__home-tag">HOME</span>
        </NavLink>
        <UsSegmented
          aria-label="表达 / 数据源"
          items={[
            { key: "what", label: "表达 WHAT" },
            { key: "data", label: "数据源 DATA" },
          ]}
          value={tab}
          onChange={(k) => setTab(k as SidebarTab)}
        />
        <UsInput
          kind="search"
          onChange={(event) =>
            setSearch((current) =>
              updateDataCatalogSidebarSearch(current, tab, event.target.value),
            )
          }
          placeholder={
            tab === "what" ? "搜索表达…" : "搜索目录、记录库、已加载记录…"
          }
          aria-label="搜索"
          value={search[tab]}
        />
      </div>
      <div className="us-sidebar__list">
        {tab === "what" ? (
          <>
            {visibleExpressions.map((expression) => {
              const formsLabel = expression.viewIds
                .map(
                  (viewId) =>
                    snapshot.views.find((view) => view.id === viewId)?.kind,
                )
                .filter(Boolean)
                .join("·")
                .toUpperCase();
              return (
                <NavLink
                  key={expression.id}
                  to={usPaths.expr(expression.id, expression.defaultForm)}
                  className="us-navitem"
                >
                  <span className="us-navitem__dot" aria-hidden />
                  <span className="us-navitem__label">{expression.name}</span>
                  <span className="us-navitem__tag">{formsLabel}</span>
                </NavLink>
              );
            })}
            {activeSpace === "workshop" ? (
              <div>
                <div className="us-sidebar__section">模板 TEMPLATES</div>
                {snapshot.sceneTemplates.map((template) => (
                  <span
                    className="us-navitem us-navitem--indent"
                    key={template.id}
                  >
                    <span className="us-navitem__dot" aria-hidden />
                    <span className="us-navitem__label">{template.name}</span>
                    {usedTemplateIds.has(template.id) ? (
                      <span className="us-navitem__tag">使用中</span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
            <ExpressionCreateTrigger surface="sidebar" />
          </>
        ) : (
          <UsDataCatalogTree
            error={catalogSidebar.error}
            expandedKeys={visibleCatalogExpandedKeys}
            loading={catalogSidebar.loading}
            nodes={catalogSearch.nodes}
            onExpandedKeysChange={(visibleKeys) =>
              setCatalogExpandedState((current) =>
                reconcileDataCatalogExpandedKeys(
                  current,
                  visibleKeys,
                  automaticCatalogExpandedKeys,
                ),
              )
            }
            onLibraryOpen={(objectTypeCode) =>
              navigate(dataCatalogLibraryPath(objectTypeCode))
            }
            onLoadMore={(objectTypeCode) => {
              void loadMoreCatalogRecordsForSidebar(
                snapshot.workspace.id,
                objectTypeCode,
                runtime.catalogGateway,
                dataCatalogStore,
              );
            }}
            onRecordLibraryExpand={(objectTypeCode) => {
              void loadCatalogRecordsForSidebar(
                snapshot.workspace.id,
                objectTypeCode,
                runtime.catalogGateway,
                dataCatalogStore,
              );
            }}
            onRecordOpen={(objectTypeCode, objectId) =>
              navigate(dataCatalogRecordPath(objectTypeCode, objectId))
            }
            onRetry={() => {
              void loadDataCatalogForSidebar(
                catalogSidebar.shouldLoadCatalog,
                snapshot.workspace.id,
                runtime.catalogGateway,
                dataCatalogStore,
                true,
              );
            }}
            onRetryRecords={(objectTypeCode) => {
              void retryCatalogRecordsForSidebar(
                snapshot.workspace.id,
                objectTypeCode,
                runtime.catalogGateway,
                dataCatalogStore,
              );
            }}
            selectedKeys={catalogTree.selectedKeys}
            searchEmptyMessage={
              catalogSearch.query &&
              !catalogSearch.hasLoadedMatch &&
              !catalogSearch.hasUnloadedLibraries
                ? "没有匹配的数据目录内容"
                : null
            }
            searchHint={
              catalogSearch.query && catalogSearch.hasUnloadedLibraries
                ? "记录仅搜索已加载内容"
                : null
            }
          />
        )}
      </div>
      <div className="us-sidebar__foot">
        {runOpen && currentForm === "canvas"
          ? "仿真读取节点字段(协议、延迟、功耗)— 数据一改,回放结果随之变化。"
          : currentForm === "matrix"
            ? "矩阵把状态字段变成看板列,拖动即写回数据源。"
            : currentForm === "ana"
              ? "分析结论可固化为洞察卡,钉回看板或写入周报。"
              : activeSpace === "workshop" && tab === "what"
                ? "模板只保存抽象槽位；实例化后可换一套数据源整图复用。"
                : FOOTNOTES[tab]}
      </div>
    </nav>
  );
}
