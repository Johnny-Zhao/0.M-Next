import type { ReactNode } from "react";

import type { UsCrumb, UsSyncState } from "../primitives";
import { AppSidebar } from "./app-sidebar";
import { WorkspaceHeader, type HeaderPerson } from "./workspace-header";

export interface ChromeProps {
  breadcrumb: UsCrumb[];
  breadcrumbTail?: ReactNode;
  sync?: { state: UsSyncState; label: ReactNode };
  people?: HeaderPerson[];
  actions?: ReactNode;
}

/**
 * WorkspaceLayout — 工作区页骨架:侧栏 264 + 顶栏 48 + 内容(画布灰底);
 * 可选 subHeader 槽(P1 的 HOW 形式行)与右栏 inspector 槽。
 */
export function WorkspaceLayout({
  chrome,
  sidebarTab,
  subHeader,
  inspector,
  children,
}: {
  chrome: ChromeProps;
  sidebarTab?: "what" | "data";
  subHeader?: ReactNode;
  inspector?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="us-workspace">
      <AppSidebar defaultTab={sidebarTab} />
      <div className="us-workspace__main">
        <WorkspaceHeader variant="workspace" {...chrome} />
        {subHeader}
        <div className="us-workspace__row">
          <main className="us-workspace__content">{children}</main>
          {inspector}
        </div>
      </div>
    </div>
  );
}

/** FullLayout — 设置/校验类全宽页骨架:52px 顶栏(带 Logo)+ 内容。 */
export function FullLayout({
  chrome,
  children,
}: {
  chrome: ChromeProps;
  children: ReactNode;
}) {
  return (
    <div className="us-workspace">
      <div className="us-workspace__main">
        <WorkspaceHeader variant="full" {...chrome} />
        <div className="us-workspace__row">
          <main className="us-workspace__content">{children}</main>
        </div>
      </div>
    </div>
  );
}
