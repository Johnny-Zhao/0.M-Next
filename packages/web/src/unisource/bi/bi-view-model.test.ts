import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { buildBiBoardVm } from "./bi-view-model";

describe("buildBiBoardVm", () => {
  it("derives visible KPI cards and bars", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const workspace = store.getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-dashboard-bi",
    )!;

    const vm = buildBiBoardVm(workspace, view);

    expect(vm.title).toBe("各渠道销量 · 本月");
    expect(vm.sourceLabel).toBe("渠道销量表");
    expect(vm.kpis).toHaveLength(4);
    expect(vm.kpis.find((kpi) => kpi.aiAdded)?.id).toBe("kpi-active-channels");
    expect(vm.kpis.some((kpi) => kpi.id === "kpi-ana-aov-net")).toBe(false);
    expect(vm.bars.map((bar) => bar.tone)).toEqual([
      "high",
      "mid",
      "mid",
      "low",
      "low",
    ]);
  });

  it("hides AI KPI cards after undo", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    store.setKpiVisible("kpi-active-channels", false, "wangyun");

    expect(buildBiBoardVm(store.getSnapshot()).kpis).toHaveLength(3);
  });

  it("reveals analysis KPI cards when they are pinned", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    store.setKpiVisible("kpi-ana-aov-net", true, "wangyun");

    expect(
      buildBiBoardVm(store.getSnapshot()).kpis.map((kpi) => kpi.id),
    ).toContain("kpi-ana-aov-net");
  });

  it("reads configured record counts and raw values from the current workspace", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const vm = buildBiBoardVm(workspace, {
      id: "bi-current-data",
      exprId: "expr",
      kind: "bi",
      config: {
        metrics: [
          { kind: "count", objectTypeCode: "product_specs", label: "产品数" },
        ],
        recordSeries: {
          objectTypeCode: "product_specs",
          labelFieldCode: "name",
          valueFieldCode: "price",
        },
      },
    });

    expect(vm.kpis[0]).toMatchObject({ label: "产品数", value: "8" });
    expect(vm.bars[0]).toMatchObject({ label: "门锁 S3", value: 1199 });
  });

  it("reads selected derived fields and backend validation counts", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = {
      id: "bi-pc",
      exprId: "expr",
      kind: "bi" as const,
      config: {
        metrics: [
          {
            id: "price",
            kind: "field",
            objectTypeCode: "product_specs",
            fieldCode: "price",
            unit: "CNY",
          },
          {
            id: "block",
            kind: "validation",
            objectTypeCode: "product_specs",
            level: "BLOCK",
          },
        ],
      },
    };
    const objectId = workspace.objects.find(
      (object) => object.objectTypeCode === "product_specs",
    )!.id;
    const vm = buildBiBoardVm(
      workspace,
      view,
      { entityType: "object", entityId: objectId },
      [
        {
          ruleCode: "R-TEST",
          group: "瀛楁绾︽潫" as never,
          level: "error",
          title: "block",
          detail: "block",
          impact: [],
          fixes: [],
          target: { entityType: "object", entityId: objectId },
        },
      ],
      "ready",
    );
    expect(vm.kpis[0]).toMatchObject({ value: "1199 CNY" });
    expect(vm.kpis[1]).toMatchObject({ value: "1" });
  });

  it("does not turn missing selected derived data into zero", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const vm = buildBiBoardVm(
      workspace,
      {
        id: "bi-pc",
        exprId: "expr",
        kind: "bi",
        config: {
          metrics: [
            {
              kind: "field",
              objectTypeCode: "product_specs",
              fieldCode: "missing_fx",
            },
          ],
        },
      },
      { entityType: "object", entityId: workspace.objects[0]!.id },
    );
    expect(vm.kpis[0]?.value).toBe("暂无派生值");
  });

  it("keeps BI fallback and validation status labels readable", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const vm = buildBiBoardVm(workspace, {
      id: "bi-labels",
      exprId: "expr",
      kind: "bi",
      config: {
        title: "采购指标",
        sourceLabel: "当前电脑采购工作空间",
        emptyLabel: "暂无可展示图表数据",
        metrics: [
          {
            kind: "field",
            objectTypeCode: "product_specs",
            fieldCode: "missing_fx",
            label: "方案总价",
          },
          {
            kind: "validation",
            objectTypeCode: "product_specs",
            level: "BLOCK",
            label: "BLOCK 校验",
          },
        ],
      },
    });

    expect(vm.title).toBe("采购指标");
    expect(vm.sourceLabel).toBe("当前电脑采购工作空间");
    expect(vm.emptyLabel).toBe("暂无可展示图表数据");
    expect(vm.kpis.map((kpi) => kpi.value)).toEqual(["暂无当前方案", "未校验"]);
    expect(vm.kpis.map((kpi) => kpi.delta)).toEqual([
      "当前真实对象",
      "数据已变更或尚未校验",
    ]);
  });
});
