import { useState } from "react";
import { NavLink } from "react-router-dom";

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
            {snapshot.expressions.map((expression) => {
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
            <span className="us-navitem us-navitem--new">+ 新建表达</span>
          </>
        ) : (
          centerOrder.map((center) => (
            <div key={center}>
              <div className="us-sidebar__section">{center}</div>
              {snapshot.objectTypes
                .filter((type) => type.group === center)
                .map((type) => (
                  <NavLink
                    key={type.code}
                    to={usPaths.source(type.code)}
                    className="us-navitem us-navitem--indent"
                  >
                    <span className="us-navitem__dot" aria-hidden />
                    <span className="us-navitem__label">{type.name}</span>
                  </NavLink>
                ))}
            </div>
          ))
        )}
      </div>
      <div className="us-sidebar__foot">{FOOTNOTES[tab]}</div>
    </nav>
  );
}
