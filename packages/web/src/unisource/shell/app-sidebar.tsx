import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { UsInput, UsSegmented } from "../primitives";
import { usPaths } from "../routes-paths";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { UsLogo } from "./logo";

type SidebarTab = "what" | "data";

const FOOTNOTES: Record<SidebarTab, string> = {
  what: "表达 = 一次「要说的事」。右侧标注它已挂的描述形式。",
  data: "数据只有一份本源;表格只是打开库时的默认描述形式,可随时换。",
};

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
  const snapshot = useWorkspaceSnapshot();
  const location = useLocation();
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
  const centerOrder = Array.from(
    new Set(snapshot.objectTypes.map((type) => type.group)),
  );

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
          placeholder={tab === "what" ? "搜索表达…" : "搜索字段/记录…"}
          aria-label="搜索"
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
            <span className="us-navitem us-navitem--new">+ 新建表达</span>
          </>
        ) : (
          centerOrder.map((center) => (
            <div key={center}>
              <div className="us-sidebar__section">{center}</div>
              {snapshot.objectTypes
                .filter((type) => type.group === center)
                .map((type) => {
                  const isOpen =
                    location.pathname === usPaths.source(type.code);
                  return (
                    <NavLink
                      key={type.code}
                      to={usPaths.source(type.code)}
                      className="us-navitem us-navitem--indent"
                    >
                      <span className="us-navitem__dot" aria-hidden />
                      <span className="us-navitem__label">{type.name}</span>
                      {isOpen ? (
                        <span className="us-navitem__tag">打开中</span>
                      ) : null}
                    </NavLink>
                  );
                })}
            </div>
          ))
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
