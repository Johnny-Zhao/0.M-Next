import { useState, type ReactNode } from "react";

import { UsUnderlineTabs, cx } from "../primitives";

export interface InspectorTab {
  key: string;
  label: ReactNode;
  content: ReactNode;
}

/**
 * Inspector 容器(右栏 316px,1280 档降 280;交接规格 §02 InspectorPanel 的容器层):
 * UnderlineTabs(属性/样式/版本)+ 右上 mono 备注(如「已选 3」)+ 滚动内容区。
 * P0 仅容器与页签切换;三个面板的业务内容在 P2 画布批实现。
 */
export function UsInspector({
  tabs,
  aside,
  defaultTab,
  className,
}: {
  tabs: InspectorTab[];
  aside?: ReactNode;
  defaultTab?: string;
  className?: string;
}) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active);
  return (
    <aside className={cx("us-inspector", className)} aria-label="检查器">
      <div className="us-inspector__tabs">
        <UsUnderlineTabs
          aria-label="检查器页签"
          items={tabs.map(({ key, label }) => ({ key, label }))}
          value={active}
          onChange={setActive}
          aside={aside}
        />
      </div>
      <div className="us-inspector__body">{current?.content}</div>
    </aside>
  );
}
