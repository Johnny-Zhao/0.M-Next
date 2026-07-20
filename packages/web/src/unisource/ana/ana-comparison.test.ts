import { describe, expect, it } from "vitest";

import type { WorkspaceState } from "../state/workspace-store";
import type { RuleOutcome } from "../validation/rules";
import {
  anaSelectionForIssue,
  anaSelectionForRow,
  buildAnaComparison,
} from "./ana-comparison";

const config = {
  sourceObjectTypeCode: "build_plan",
  scopeRelationTypeCodes: ["contains_item", "item_selects_product"],
  scopeDepth: 2,
  columns: [
    { key: "name", label: "方案名称", fieldCode: "name" },
    { key: "code", label: "方案编码", fieldCode: "code" },
    {
      key: "price",
      label: "方案总价",
      fieldCode: "total_price_cny_fx",
      derived: true,
    },
    {
      key: "power",
      label: "方案总功耗",
      fieldCode: "total_power_w_fx",
      derived: true,
    },
    {
      key: "performance",
      label: "方案性能分",
      fieldCode: "total_performance_score_fx",
      derived: true,
    },
    {
      key: "inventory",
      label: "报价库存",
      fieldCode: "quote_inventory_fx",
      derived: true,
      relationPath: ["contains_item"],
    },
  ],
} as const;

describe("ANA comparison", () => {
  it("projects real plan fields and derives status only from kernel outcomes", () => {
    const vm = buildAnaComparison(
      workspace(),
      config,
      [outcome("warning", "item-a")],
      "ready",
    );

    expect(vm.rows[0]).toMatchObject({
      objectId: "plan-a",
      values: {
        name: "标准方案",
        code: "PLAN-STD",
        price: "8000",
        power: "420",
        performance: "680",
        inventory: "20",
      },
      status: "warn",
      issueCount: 1,
    });
    expect(vm.rows[1]).toMatchObject({ status: "ok", issueCount: 0 });
    expect(vm.summary).toEqual({
      total: 2,
      ok: 1,
      block: 0,
      warn: 1,
      unchecked: 0,
    });
  });

  it("does not report missing derived data or missing validation as successful", () => {
    const noDerived = buildAnaComparison(
      workspace({
        total_price_cny_fx: null,
        total_power_w_fx: null,
        total_performance_score_fx: null,
      }),
      config,
      [],
      "ready",
    );
    expect(noDerived.state).toBe("missing-derived");
    expect(noDerived.rows[0]?.values.price).toBeNull();

    const unvalidated = buildAnaComparison(workspace(), config, [], "idle");
    expect(unvalidated.state).toBe("unvalidated");
    expect(unvalidated.rows.every((row) => row.status === "unchecked")).toBe(
      true,
    );
  });

  it("reports an empty comparison instead of creating a static plan", () => {
    const vm = buildAnaComparison(
      { objects: [], relations: [] },
      config,
      [],
      "ready",
    );
    expect(vm).toMatchObject({ state: "no-plans", rows: [] });
  });

  it("keeps dangling outcomes inert and exposes real selections without writes", () => {
    const vm = buildAnaComparison(
      workspace(),
      config,
      [outcome("error", "missing-item")],
      "ready",
    );
    expect(vm.issues[0]).toMatchObject({
      state: "dangling",
      selection: { entityId: "missing-item" },
    });
    expect(anaSelectionForIssue(vm.issues[0]!)).toBeNull();

    const ready = buildAnaComparison(
      workspace(),
      config,
      [outcome("error", "item-a")],
      "ready",
    );
    expect(anaSelectionForRow(ready.rows[0]!)).toEqual({
      entityType: "object",
      entityId: "plan-a",
    });
    expect(anaSelectionForIssue(ready.issues[0]!)).toEqual({
      entityType: "object",
      entityId: "item-a",
    });
  });
});

function workspace(
  planFields: Record<string, string | number | null> = {},
): Pick<WorkspaceState, "objects" | "relations"> {
  return {
    objects: [
      object("plan-a", "build_plan", {
        name: "标准方案",
        code: "PLAN-STD",
        total_price_cny_fx: 8000,
        total_power_w_fx: 420,
        total_performance_score_fx: 680,
        ...planFields,
      }),
      object("plan-b", "build_plan", {
        name: "风险方案",
        code: "PLAN-RISK",
        total_price_cny_fx: 9200,
        total_power_w_fx: 540,
        total_performance_score_fx: 700,
        ...planFields,
      }),
      object("item-a", "build_plan_item", { quote_inventory_fx: 20 }),
      object("item-b", "build_plan_item", { quote_inventory_fx: 8 }),
    ],
    relations: [
      relation("rel-a", "contains_item", "plan-a", "item-a"),
      relation("rel-b", "contains_item", "plan-b", "item-b"),
    ],
  };
}

function object(
  id: string,
  objectTypeCode: string,
  values: Record<string, string | number | null>,
): WorkspaceState["objects"][number] {
  return {
    id,
    objectTypeCode,
    status: "active",
    version: 1,
    fields: Object.fromEntries(
      Object.entries(values).map(([code, value]) => [
        code,
        {
          value,
          fieldVersion: 1,
          updatedBy: "wangyun",
          updatedAt: "",
          source: "manual",
        },
      ]),
    ),
    createdBy: "wangyun",
    createdAt: "",
    updatedBy: "wangyun",
    updatedAt: "",
  };
}

function relation(
  id: string,
  relationTypeCode: string,
  sourceId: string,
  targetId: string,
): WorkspaceState["relations"][number] {
  return {
    id,
    relationTypeCode,
    sourceId,
    targetId,
    status: "active",
    version: 1,
    fields: {},
    annotationIds: [],
  };
}

function outcome(level: "error" | "warning", objectId: string): RuleOutcome {
  return {
    ruleCode: "R-TEST",
    group: "字段约束" as RuleOutcome["group"],
    level,
    title: "规则说明",
    detail: "真实后端规则结果",
    impact: [],
    fixes: [],
    target: { entityType: "object", entityId: objectId },
  };
}
