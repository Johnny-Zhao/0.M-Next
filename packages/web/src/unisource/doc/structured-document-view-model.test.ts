import { describe, expect, it } from "vitest";

import type {
  DataFieldPrimitive,
  DataObject,
  ObjectTypeDef,
} from "../model/kernel";
import { pcProcurementPreset } from "../presentation/pc-procurement-preset";
import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  buildStructuredDocumentOutline,
  buildStructuredDocumentViewModel,
  documentFieldSelection,
  documentObjectSelection,
  readStructuredDocumentConfig,
  resolveStructuredDocumentActiveOutlineId,
  structuredDocumentOutlineSelection,
} from "./structured-document-view-model";

describe("structured-document-view-model", () => {
  it("reads plan, item and derived values from the current workspace graph", () => {
    const { workspace, doc, config } = procurementFixture();
    const vm = buildStructuredDocumentViewModel(workspace, doc, config);

    expect(vm.state).toBe("ready");
    expect(vm.root?.objectId).toBe("plan-real-id");
    expect(vm.body).toMatchObject({
      fieldCode: "body",
      value: '{"type":"doc"}',
      state: "fresh",
      editable: true,
    });
    expect(vm.root?.fields.some((field) => field.fieldCode === "body")).toBe(
      false,
    );
    expect(fieldValue(vm.root?.fields ?? [], "total_price_cny_fx")).toBe(
      "¥8,783",
    );
    const item =
      vm.sections[0]?.state === "ready" ? vm.sections[0].rows[0] : null;
    expect(item).toMatchObject({ state: "ready" });
    if (item?.state !== "ready") throw new Error("expected item row");
    expect(fieldValue(item.object.fields, "selected_unit_price_cny_fx")).toBe(
      "¥1,699",
    );
    expect(fieldValue(item.object.fields, "total_price_cny_fx")).toBe("¥1,699");
  });

  it("keeps missing relation targets and field references diagnosable", () => {
    const { workspace, doc, config } = procurementFixture();
    const missingTarget = {
      ...workspace,
      objects: workspace.objects.filter(
        (object) => object.id !== "item-real-id",
      ),
    };
    const targetVm = buildStructuredDocumentViewModel(
      missingTarget,
      doc,
      config,
    );
    expect(targetVm.sections[0]).toMatchObject({ state: "ready" });
    expect(
      targetVm.sections[0]?.state === "ready" && targetVm.sections[0].rows[0],
    ).toMatchObject({
      state: "dangling",
      message: "引用对象不存在",
    });

    const fieldVm = buildStructuredDocumentViewModel(
      { ...workspace, objects: workspace.objects.map(withoutItemTotal) },
      doc,
      config,
    );
    const row =
      fieldVm.sections[0]?.state === "ready"
        ? fieldVm.sections[0].rows[0]
        : null;
    expect(
      row?.state === "ready" &&
        fieldValue(row.object.fields, "total_price_cny_fx"),
    ).toBe("字段引用已失效");

    const bindingVm = buildStructuredDocumentViewModel(
      workspace,
      { ...doc, binding: { objectId: "missing-plan", state: "dangling" } },
      config,
    );
    expect(bindingVm).toMatchObject({
      state: "dangling",
      message: "引用对象不存在",
    });
  });

  it("only exposes configured stored fields as editable and publishes SelectionRef", () => {
    const { workspace, doc, config } = procurementFixture();
    const vm = buildStructuredDocumentViewModel(workspace, doc, config);
    const root = vm.root!;
    const item =
      vm.sections[0]?.state === "ready" ? vm.sections[0].rows[0] : null;
    if (item?.state !== "ready") throw new Error("expected item row");

    expect(
      root.fields.find((field) => field.fieldCode === "name")?.editable,
    ).toBe(true);
    expect(
      root.fields.find((field) => field.fieldCode === "code")?.editable,
    ).toBe(false);
    expect(
      root.fields.find((field) => field.fieldCode === "total_price_cny_fx")
        ?.editable,
    ).toBe(false);
    expect(
      item.object.fields.find((field) => field.fieldCode === "quantity")
        ?.editable,
    ).toBe(true);
    expect(documentObjectSelection(root)).toEqual({
      entityType: "object",
      entityId: "plan-real-id",
    });
    expect(documentFieldSelection(item.object.fields[2]!)).toEqual({
      entityType: "field",
      entityId: "item-real-id",
      fieldCode: "quantity",
    });

    const archived = buildStructuredDocumentViewModel(
      { ...workspace, objects: workspace.objects.map(archivePlan) },
      doc,
      config,
    );
    expect(
      archived.root?.fields.find((field) => field.fieldCode === "name")
        ?.editable,
    ).toBe(false);

    for (const status of ["deleted", "soft-deleted"] as const) {
      const terminal = buildStructuredDocumentViewModel(
        {
          ...workspace,
          objects: workspace.objects.map((object) =>
            object.id === "plan-real-id" ? { ...object, status } : object,
          ),
        },
        doc,
        config,
      );
      expect(
        terminal.root?.fields.find((field) => field.fieldCode === "name")
          ?.editable,
      ).toBe(false);
    }

    const readOnly = buildStructuredDocumentViewModel(
      { ...workspace, objectTypes: workspace.objectTypes.map(readOnlyStatus) },
      doc,
      config,
    );
    expect(
      readOnly.root?.fields.find((field) => field.fieldCode === "status")
        ?.editable,
    ).toBe(false);
  });

  it("uses the presentation preset as codes-only structured document configuration", () => {
    const view = pcProcurementPreset.views.find(
      (candidate) => candidate.id === "view-pc-doc",
    )!;
    const parsed = readStructuredDocumentConfig(view.config);

    expect(parsed.state).toBe("ready");
    if (parsed.state !== "ready") throw new Error("expected structured config");
    expect(parsed.config.root.objectTypeCode).toBe("build_plan");
    expect(parsed.config.bodyFieldCode).toBe("body");
    expect(
      parsed.config.sections.map((section) => section.relationTypeCode),
    ).toEqual(["build_plan_contains_item", "build_plan_satisfies_requirement"]);
    expect(parsed.config.sections[0]?.createAction).toBe(
      "pc_procurement.procurement-item",
    );
  });

  it("keeps a missing body field unavailable without fabricating content", () => {
    const { workspace, doc, config } = procurementFixture();
    const withoutBodyDefinition = {
      ...workspace,
      objectTypes: workspace.objectTypes.map((type) =>
        type.code === "build_plan"
          ? {
              ...type,
              fields: type.fields.filter((field) => field.code !== "body"),
            }
          : type,
      ),
    };
    const vm = buildStructuredDocumentViewModel(
      withoutBodyDefinition,
      doc,
      config,
    );
    expect(vm.body).toMatchObject({ state: "dangling", fieldCode: "body" });
  });

  it("keeps document action ids opaque to the generic model", () => {
    const parsed = readStructuredDocumentConfig({
      structuredDocument: {
        root: { objectTypeCode: "sample", fields: [], editableFields: [] },
        sections: [
          {
            relationTypeCode: "contains",
            title: "明细",
            createAction: "future-domain-action",
            objectTypeCode: "sample_item",
            fields: [],
            editableFields: [],
          },
        ],
      },
    });

    expect(parsed).toMatchObject({
      state: "ready",
      config: { sections: [{ createAction: "future-domain-action" }] },
    });
  });

  it("builds a navigable outline from the loaded root, sections and rows", () => {
    const { workspace, doc, config } = procurementFixture();
    const vm = buildStructuredDocumentViewModel(workspace, doc, config);
    const outline = buildStructuredDocumentOutline(vm);

    expect(outline.map((item) => item.kind)).toEqual([
      "root",
      "section",
      "row",
      "section",
      "row",
    ]);
    expect(outline[0]).toMatchObject({
      kind: "root",
      objectId: "plan-real-id",
      state: "ready",
    });
    expect(outline[2]).toMatchObject({
      kind: "row",
      objectId: "item-real-id",
      state: "ready",
    });
    expect(structuredDocumentOutlineSelection(outline[2]!)).toEqual({
      entityType: "object",
      entityId: "item-real-id",
    });
    expect(structuredDocumentOutlineSelection(outline[1]!)).toBeNull();
  });

  it("keeps missing sections and dangling rows visible in the outline", () => {
    const { workspace, doc, config } = procurementFixture();
    const danglingWorkspace = {
      ...workspace,
      objects: workspace.objects.filter(
        (object) => object.id !== "item-real-id",
      ),
      relations: workspace.relations.filter(
        (relation) =>
          relation.relationTypeCode !== "build_plan_satisfies_requirement",
      ),
    };
    const vm = buildStructuredDocumentViewModel(danglingWorkspace, doc, config);
    const outline = buildStructuredDocumentOutline(vm);

    expect(outline).toContainEqual(
      expect.objectContaining({ kind: "row", state: "dangling" }),
    );
    expect(outline).toContainEqual(
      expect.objectContaining({
        kind: "section",
        relationTypeCode: "build_plan_satisfies_requirement",
        state: "missing",
      }),
    );
    const dangling = outline.find(
      (item) => item.kind === "row" && item.state === "dangling",
    )!;
    expect(structuredDocumentOutlineSelection(dangling)).toBeNull();
  });

  it("preserves an existing active outline item and falls back when it disappears", () => {
    const { workspace, doc, config } = procurementFixture();
    const vm = buildStructuredDocumentViewModel(workspace, doc, config);
    const outline = buildStructuredDocumentOutline(vm);
    const rowId = outline.find((item) => item.kind === "row")!.id;

    expect(resolveStructuredDocumentActiveOutlineId(outline, rowId)).toBe(
      rowId,
    );
    expect(
      resolveStructuredDocumentActiveOutlineId(
        outline.filter((item) => item.id !== rowId),
        rowId,
      ),
    ).toBe(outline[0]!.id);
  });
});

function procurementFixture() {
  const base = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
  const view = pcProcurementPreset.views.find(
    (candidate) => candidate.id === "view-pc-doc",
  )!;
  const parsed = readStructuredDocumentConfig(view.config);
  if (parsed.state !== "ready") throw new Error("expected structured config");
  return {
    workspace: {
      ...base,
      objectTypes: procurementTypes,
      objects: [plan, item, requirement],
      relations: [containsItem, satisfiesRequirement],
    },
    doc: {
      exprId: "exp-pc-document",
      docNo: "PC-PROCUREMENT-PLAN",
      template: "采购方案说明书",
      binding: { objectId: "plan-real-id", state: "fresh" as const },
      authorLine: "采购工作台",
      blocks: [],
    },
    config: parsed.config,
  };
}

function fieldValue(
  fields: readonly { readonly fieldCode: string; readonly valueText: string }[],
  fieldCode: string,
): string | undefined {
  return fields.find((field) => field.fieldCode === fieldCode)?.valueText;
}

function withoutItemTotal(object: DataObject): DataObject {
  if (object.id !== "item-real-id") return object;
  const fields = { ...object.fields };
  delete fields.total_price_cny_fx;
  return { ...object, fields };
}

function archivePlan(object: DataObject): DataObject {
  return object.id === "plan-real-id"
    ? { ...object, status: "archived" }
    : object;
}

function readOnlyStatus(objectType: ObjectTypeDef): ObjectTypeDef {
  if (objectType.code !== "build_plan") return objectType;
  return {
    ...objectType,
    fields: objectType.fields.map((field) =>
      field.code === "status" ? { ...field, readOnly: true } : field,
    ),
  };
}

const procurementTypes: readonly ObjectTypeDef[] = [
  {
    code: "build_plan",
    name: "装机方案",
    group: "电脑采购",
    fields: [
      textField("code"),
      textField("name"),
      textField("body"),
      enumField("status", ["DRAFT", "PROPOSED", "APPROVED", "ARCHIVED"]),
      numberField("total_price_cny_fx", "CNY", true),
      numberField("total_power_w_fx", "W", true),
      numberField("total_performance_score_fx", undefined, true),
    ],
  },
  {
    code: "build_plan_item",
    name: "方案明细",
    group: "电脑采购",
    fields: [
      textField("code"),
      textField("name"),
      numberField("quantity"),
      numberField("selected_unit_price_cny_fx", "CNY", true),
      numberField("total_price_cny_fx", "CNY", true),
      numberField("power_w_fx", "W", true),
      numberField("selected_performance_score_fx", undefined, true),
    ],
  },
  {
    code: "procurement_requirement",
    name: "采购需求",
    group: "电脑采购",
    fields: [
      textField("code"),
      textField("name"),
      numberField("budget_cny", "CNY"),
      numberField("max_total_power_w", "W"),
    ],
  },
];

const plan = testObject("plan-real-id", "build_plan", {
  code: "PLAN-PC-VALID",
  name: "兼容工作站方案",
  status: "PROPOSED",
  body: '{"type":"doc"}',
  total_price_cny_fx: 8783,
  total_power_w_fx: 396,
  total_performance_score_fx: 560,
});
const item = testObject("item-real-id", "build_plan_item", {
  code: "ITEM-V-CPU",
  name: "CPU 明细",
  quantity: 1,
  selected_unit_price_cny_fx: 1699,
  total_price_cny_fx: 1699,
  power_w_fx: 125,
  selected_performance_score_fx: 85,
});
const requirement = testObject(
  "requirement-real-id",
  "procurement_requirement",
  {
    code: "REQ-PC-001",
    name: "研发工作站采购需求",
    budget_cny: 10000,
    max_total_power_w: 650,
  },
);
const containsItem = relation(
  "rel-contains",
  "build_plan_contains_item",
  "plan-real-id",
  "item-real-id",
);
const satisfiesRequirement = relation(
  "rel-satisfies",
  "build_plan_satisfies_requirement",
  "plan-real-id",
  "requirement-real-id",
);

function textField(code: string) {
  return { code, name: code, dataType: "text" as const };
}

function enumField(code: string, enumValues: readonly string[]) {
  return { code, name: code, dataType: "enum" as const, enumValues };
}

function numberField(code: string, unit?: string, computed = false) {
  return {
    code,
    name: code,
    dataType: "number" as const,
    unit,
    computed,
    readOnly: computed,
  };
}

function testObject(
  id: string,
  objectTypeCode: string,
  fields: Record<string, DataFieldPrimitive>,
): DataObject {
  const now = "2026-07-15T10:00:00+08:00";
  return {
    id,
    objectTypeCode,
    status: "active",
    version: 7,
    fields: Object.fromEntries(
      Object.entries(fields).map(([code, value]) => [
        code,
        {
          value,
          fieldVersion: 7,
          updatedBy: "wangyun",
          updatedAt: now,
          source: "manual",
        },
      ]),
    ),
    createdBy: "wangyun",
    createdAt: now,
    updatedBy: "wangyun",
    updatedAt: now,
  };
}

function relation(
  id: string,
  relationTypeCode: string,
  sourceId: string,
  targetId: string,
) {
  return {
    id,
    relationTypeCode,
    sourceId,
    targetId,
    status: "active" as const,
    fields: {},
    version: 1,
    annotationIds: [],
  };
}
