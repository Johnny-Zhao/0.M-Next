import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AnaComparisonVm } from "./ana-comparison";
import { AnaComparisonView } from "./ana-comparison-view";

describe("AnaComparisonView layout", () => {
  it("keeps summary, table, and risk drilldown in separate regions", () => {
    const html = renderToStaticMarkup(
      <AnaComparisonView
        activePlanId="plan-1"
        comparison={comparison()}
        onSelectIssue={() => undefined}
        onSelectPlan={() => undefined}
      />,
    );

    expect(html).toContain('class="us-ana-comparison-layout"');
    expect(html).toContain('class="us-ana-comparison-main"');
    expect(html).toContain('class="us-ana-risk-panel"');
    expect(html).toContain('class="us-ana-table-scroll"');
    expect(html).toContain('data-column-key="name"');
    expect(html).toContain('data-column-key="issueCount"');
    expect(html).toContain("定位关联对象");
  });

  it("renders stale status without changing selection content", () => {
    const html = renderToStaticMarkup(
      <AnaComparisonView
        activePlanId={null}
        comparison={{ ...comparison(), stale: true }}
        onSelectIssue={() => undefined}
        onSelectPlan={() => undefined}
      />,
    );

    expect(html).toContain("数据已变更，请重新校验；分析结果可能已过期");
    expect(html).toContain("PLAN-STD");
  });
});

function comparison(): AnaComparisonVm {
  return {
    state: "ready",
    stale: false,
    columns: [
      { key: "name", label: "方案名称", fieldCode: "name" },
      {
        key: "price",
        label: "方案总价",
        fieldCode: "total_price_cny_fx",
        derived: true,
      },
    ],
    rows: [
      {
        objectId: "plan-1",
        values: { name: "PLAN-STD", price: "8000 CNY" },
        status: "ok",
        issueCount: 0,
      },
    ],
    issues: [
      {
        ruleCode: "R-PC-POWER",
        level: "BLOCK",
        title: "电源安全余量",
        detail: "需要调整电源容量",
        selection: { entityType: "object", entityId: "plan-1" },
        state: "ready",
        planObjectIds: ["plan-1"],
      },
    ],
    questions: [
      {
        id: "lowest-power",
        label: "功耗最低",
        answer: "PLAN-STD",
        objectId: "plan-1",
      },
    ],
    summary: { total: 1, ok: 1, block: 0, warn: 0 },
  };
}
