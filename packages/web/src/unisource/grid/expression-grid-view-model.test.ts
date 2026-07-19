import { describe, expect, it } from "vitest";

import type { DataObject, ObjectTypeDef, ViewDef } from "../model/kernel";
import {
  buildExpressionGridViewModel,
  type ExpressionGridViewModelInput,
} from "./expression-grid-view-model";

const planType: ObjectTypeDef = {
  code: "build_plan",
  name: "装机方案",
  group: "kernel",
  fields: [
    { code: "code", name: "编码", dataType: "text" },
    { code: "name", name: "名称", dataType: "text" },
    {
      code: "status",
      name: "状态",
      dataType: "enum",
      enumValues: ["PROPOSED", "APPROVED"],
    },
    {
      code: "total_price_cny_fx",
      name: "方案总价",
      dataType: "number",
      computed: true,
      readOnly: true,
    },
  ],
};

const view: ViewDef = {
  id: "view-grid",
  exprId: "expr",
  kind: "grid",
  config: {
    objectTypeCode: "build_plan",
    columns: [
      "code",
      "name",
      "status",
      { fieldCode: "total_price_cny_fx", label: "总价", unit: "CNY" },
    ],
    defaultSort: { fieldCode: "total_price_cny_fx", direction: "asc" },
    filterFields: ["status", "name"],
    pageSize: 2,
    title: "方案清单",
    description: "当前工作空间方案",
    emptyLabel: "暂无方案",
  },
};

const objects = [
  object("plan-b", "B 方案", "PROPOSED", 12872),
  object("plan-a", "A 方案", "APPROVED", 8783),
  object("plan-c", "C 方案", "PROPOSED", 9000),
];

describe("buildExpressionGridViewModel", () => {
  it("uses config columns, numeric sorting and stable paging", () => {
    const first = build({ page: 0 });
    const second = build({ page: 1 });

    expect(first.state).toBe("ready");
    expect(first.objectType?.fields.map((field) => field.code)).toEqual([
      "code",
      "name",
      "status",
      "total_price_cny_fx",
    ]);
    expect(first.objectType?.fields[3]).toMatchObject({
      name: "总价",
      unit: "CNY",
      readOnly: true,
    });
    expect(first.objects.map((item) => item.id)).toEqual(["plan-a", "plan-c"]);
    expect(second.objects.map((item) => item.id)).toEqual(["plan-b"]);
    expect(second).toMatchObject({
      page: 1,
      pageCount: 2,
      total: 3,
      rangeStart: 3,
      rangeEnd: 3,
    });
  });

  it("supports search, enum/text filters and resets an invalid page", () => {
    const searched = build({ search: "B 方案" });
    const enumFiltered = build({
      filters: { status: "PROPOSED" },
      sort: { fieldCode: "name", direction: "asc" },
    });
    const textFiltered = build({ filters: { name: "A" }, page: 9 });

    expect(searched.objects.map((item) => item.id)).toEqual(["plan-b"]);
    expect(enumFiltered.objects.map((item) => item.id)).toEqual([
      "plan-b",
      "plan-c",
    ]);
    expect(textFiltered.objects.map((item) => item.id)).toEqual(["plan-a"]);
    expect(textFiltered.page).toBe(0);
    expect(textFiltered.rangeStart).toBe(1);
  });

  it("returns explicit unavailable and neutral empty states", () => {
    const missingType = build({
      view: {
        ...view,
        config: { objectTypeCode: "missing", columns: ["code"] },
      },
    });
    const missingField = build({
      view: {
        ...view,
        config: { objectTypeCode: "build_plan", columns: ["missing"] },
      },
    });
    const empty = build({ objects: [] });

    expect(missingType.state).toBe("unavailable");
    expect(missingType.message).toContain("missing");
    expect(missingField.message).toContain("列字段 missing");
    expect(empty).toMatchObject({ state: "empty", total: 0, rangeStart: 0 });
  });

  it("uses the first loaded object type for an unspecified profile", () => {
    const generic = build({
      view: { ...view, config: { columns: [] } },
    });

    expect(generic.objectType?.code).toBe("build_plan");
    expect(generic.objectType?.fields).toEqual(planType.fields);
  });

  it("enables a configured bottom validation panel without defaulting it on", () => {
    const configured = build({
      view: {
        ...view,
        config: {
          ...view.config,
          validation: {
            enabled: true,
            objectTypeCode: "build_plan",
            position: "bottom",
            allowManualRun: true,
            scopeCanvasViewId: "view-canvas",
          },
        },
      },
    });
    const generic = build();

    expect(configured.validation).toEqual({
      objectTypeCode: "build_plan",
      position: "bottom",
      allowManualRun: true,
      scopeCanvasViewId: "view-canvas",
    });
    expect(generic.validation).toBeNull();
  });
});

function build(
  overrides: Partial<ExpressionGridViewModelInput> & {
    readonly objects?: readonly DataObject[];
  } = {},
) {
  return buildExpressionGridViewModel({
    workspace: {
      objectTypes: [planType],
      objects: overrides.objects ?? objects,
    },
    view: overrides.view ?? view,
    search: overrides.search,
    filters: overrides.filters,
    sort: overrides.sort,
    page: overrides.page,
  });
}

function object(
  id: string,
  name: string,
  status: string,
  total: number,
): DataObject {
  const value = (fieldValue: string | number) => ({
    value: fieldValue,
    fieldVersion: 1,
    updatedBy: "wangyun" as const,
    updatedAt: "2026-07-15T00:00:00Z",
    source: "manual" as const,
  });
  return {
    id,
    objectTypeCode: "build_plan",
    status: "active",
    version: 1,
    fields: {
      code: value(id),
      name: value(name),
      status: value(status),
      total_price_cny_fx: value(total),
    },
    createdBy: "wangyun",
    createdAt: "2026-07-15T00:00:00Z",
    updatedBy: "wangyun",
    updatedAt: "2026-07-15T00:00:00Z",
  };
}
