import { describe, expect, it, vi } from "vitest";

import type { DataObject, DataRelation, ObjectTypeDef } from "../model/kernel";
import type { RuleOutcome } from "./rules";
import { applyKernelValidationSelection } from "./kernel-validation-panel";
import { buildKernelValidationViewModel } from "./kernel-validation-view-model";

const objectType: ObjectTypeDef = {
  code: "plan",
  name: "方案",
  group: "kernel",
  fields: [
    { code: "code", name: "编码", dataType: "text" },
    { code: "name", name: "名称", dataType: "text" },
  ],
};

const itemType: ObjectTypeDef = {
  ...objectType,
  code: "plan_item",
  name: "方案明细",
};
const objects = [
  object("plan-a", "plan"),
  object("plan-b", "plan"),
  object("item-a", "plan_item"),
];
const relation: DataRelation = {
  id: "contains-a",
  relationTypeCode: "contains",
  sourceId: "plan-a",
  targetId: "item-a",
  status: "active",
  fields: {},
  version: 1,
  annotationIds: [],
};
const workspace = {
  objectTypes: [objectType, itemType],
  objects,
  relations: [relation],
};

describe("buildKernelValidationViewModel", () => {
  it("counts and filters backend severities without inventing passes", () => {
    const results = [
      outcome("RULE-BLOCK", "error", "plan-a"),
      outcome("RULE-WARN", "warning", "plan-b"),
    ];
    const vm = build({ results, filter: "block" });

    expect(vm).toMatchObject({
      blockCount: 1,
      warnCount: 1,
      noIssue: false,
    });
    expect(vm.items.map((item) => item.ruleCode)).toEqual(["RULE-BLOCK"]);
  });

  it("converges current-selection filtering without rerunning rules", () => {
    const results = [outcome("RULE-BLOCK", "error", "plan-a")];
    const blocked = build({
      results,
      filter: "selection",
      selection: { entityType: "object", entityId: "plan-a" },
    });
    const clear = build({
      results,
      filter: "selection",
      selection: { entityType: "object", entityId: "plan-b" },
    });

    expect(blocked.items).toHaveLength(1);
    expect(blocked.currentSelectionHasNoIssue).toBe(false);
    expect(clear.items).toMatchObject([
      { kind: "no-issue", objectId: "plan-b" },
    ]);
    expect(clear.currentSelectionHasNoIssue).toBe(true);
  });

  it("keeps missing object and field targets visible as dangling", () => {
    const results = [
      outcome("MISSING-OBJECT", "error", "gone"),
      outcome("MISSING-FIELD", "warning", "plan-a", "removed"),
      outcome("VALID", "warning", "plan-b", "name"),
    ];
    const vm = build({ results });

    expect(vm.items.map((item) => [item.state, item.stateLabel])).toEqual([
      ["dangling", "引用对象不存在"],
      ["dangling", "字段引用已失效"],
      ["resolved", null],
    ]);
  });

  it("filters object and field targets by the configured object type", () => {
    const results = [
      outcome("PLAN", "error", "plan-a"),
      outcome("PLAN-FIELD", "warning", "plan-b", "name"),
      outcome("ITEM", "error", "item-a"),
    ];
    const vm = build({ results, scopeObjectTypeCode: "plan" });

    expect(vm.items.map((item) => item.ruleCode)).toEqual([
      "PLAN",
      "PLAN-FIELD",
    ]);
    expect(vm.blockCount).toBe(1);
    expect(vm.warnCount).toBe(1);
  });

  it("keeps a relation result when either endpoint is in scope", () => {
    const result = relationOutcome("RELATION", "contains-a");

    expect(
      build({ results: [result], scopeObjectTypeCode: "plan" }).items,
    ).toHaveLength(1);
    expect(
      build({ results: [result], scopeObjectTypeCode: "plan_item" }).items,
    ).toHaveLength(1);
  });

  it("filters results and counts by supplied subtree members", () => {
    const vm = build({
      results: [
        outcome("PLAN", "error", "plan-a"),
        outcome("ITEM", "warning", "item-a"),
        outcome("OTHER", "error", "plan-b"),
      ],
      scopeMembers: new Set(["plan-a", "item-a"]),
    });

    expect(vm.items.map((item) => item.ruleCode)).toEqual(["PLAN", "ITEM"]);
    expect(vm.blockCount).toBe(1);
    expect(vm.warnCount).toBe(1);
    expect(vm.scopeIssueCount).toBe(2);
    expect(vm.outsideScopeIssueCount).toBe(1);
  });

  it("keeps a relation outcome when a scoped member is either endpoint", () => {
    const vm = build({
      results: [relationOutcome("CONTAINS", "contains-a")],
      scopeMembers: new Set(["item-a"]),
    });

    expect(vm.items.map((item) => item.ruleCode)).toEqual(["CONTAINS"]);
  });

  it("does not place an unresolved target into a current subtree", () => {
    const vm = build({
      results: [outcome("GONE", "error", "gone")],
      scopeMembers: new Set(["plan-a"]),
    });

    expect(vm.items).toEqual([]);
    expect(vm.outsideScopeIssueCount).toBe(1);
  });

  it("does not treat a descendant issue as a root issue-free object", () => {
    const vm = build({
      results: [outcome("ITEM", "warning", "item-a")],
      filter: "no-issue",
      scopeMembers: new Set(["plan-a", "item-a"]),
    });

    expect(vm.items.map((item) => item.objectId)).toEqual(["plan-a"]);
  });

  it("keeps every result without a scope and excludes unknown targets with one", () => {
    const results = [
      outcome("PLAN", "error", "plan-a"),
      outcome("ITEM", "warning", "item-a"),
      outcome("DANGLING", "error", "gone"),
    ];

    expect(build({ results, scopeObjectTypeCode: null }).items).toHaveLength(3);
    expect(
      build({ results, scopeObjectTypeCode: "plan" }).items.map(
        (item) => item.ruleCode,
      ),
    ).toEqual(["PLAN"]);
  });

  it("synthesizes only in-scope objects without BLOCK or WARN", () => {
    const vm = build({
      results: [
        outcome("PLAN-BLOCK", "error", "plan-a"),
        outcome("ITEM-WARN", "warning", "item-a"),
      ],
      filter: "no-issue",
      scopeObjectTypeCode: "plan",
    });

    expect(vm.items).toMatchObject([
      {
        kind: "no-issue",
        objectName: "plan-b",
        objectCode: "plan-b",
        message: "未发现 BLOCK/WARN",
      },
    ]);
    expect(vm.items[0]?.ruleCode).toBeNull();
  });

  it("excludes terminal objects from validation results and no-issue items", () => {
    const terminalWorkspace = {
      ...workspace,
      objects: [
        ...objects,
        { ...object("plan-archived", "plan"), status: "archived" as const },
      ],
    };
    const vm = buildKernelValidationViewModel({
      workspace: terminalWorkspace,
      results: [outcome("ARCHIVED", "error", "plan-archived")],
      status: "ready",
      error: null,
      filter: "no-issue",
      selection: null,
      scopeObjectTypeCode: "plan",
    });

    expect(vm.items.map((item) => item.objectId)).not.toContain(
      "plan-archived",
    );
    expect(vm.blockCount).toBe(0);
  });

  it.each(["idle", "running", "error"] as const)(
    "does not synthesize no-issue objects while status is %s",
    (status) => {
      const vm = build({ status, filter: "no-issue" });
      expect(vm.items).toEqual([]);
      expect(vm.noIssue).toBe(false);
    },
  );

  it("distinguishes an out-of-scope current selection from no issues", () => {
    const vm = build({
      filter: "selection",
      scopeObjectTypeCode: "plan",
      selection: { entityType: "object", entityId: "item-a" },
    });

    expect(vm.items).toEqual([]);
    expect(vm.currentSelectionHasNoIssue).toBe(false);
    expect(vm.emptyLabel).toBe("当前选择不属于当前校验范围。");
  });

  it("selects a synthetic no-issue object without invoking a write path", () => {
    const item = build({
      filter: "no-issue",
      scopeObjectTypeCode: "plan",
    }).items[0]!;
    const setSelection = vi.fn();

    expect(applyKernelValidationSelection(item, setSelection)).toBe(true);
    expect(setSelection).toHaveBeenCalledOnce();
    expect(setSelection).toHaveBeenCalledWith({
      entityType: "object",
      entityId: "plan-a",
    });
  });
});

function build(
  overrides: Partial<Parameters<typeof buildKernelValidationViewModel>[0]>,
) {
  return buildKernelValidationViewModel({
    workspace,
    results: [],
    status: "ready",
    error: null,
    filter: "all",
    selection: null,
    scopeObjectTypeCode: null,
    ...overrides,
  });
}

function relationOutcome(ruleCode: string, relationId: string): RuleOutcome {
  return {
    ...outcome(ruleCode, "warning", relationId),
    target: { entityType: "relation", entityId: relationId },
  };
}

function outcome(
  ruleCode: string,
  level: RuleOutcome["level"],
  objectId: string,
  fieldCode?: string,
): RuleOutcome {
  return {
    ruleCode,
    group: "字段约束",
    level,
    title: ruleCode,
    detail: `${ruleCode} message`,
    target: fieldCode
      ? { entityType: "field", entityId: objectId, fieldCode }
      : { entityType: "object", entityId: objectId },
    impact: [],
    fixes: [],
    runId: "run-1",
    createdAt: "2026-07-15T00:00:00Z",
  };
}

function object(id: string, objectTypeCode: string): DataObject {
  const field = (value: string) => ({
    value,
    fieldVersion: 1,
    updatedBy: "wangyun" as const,
    updatedAt: "2026-07-15T00:00:00Z",
    source: "manual" as const,
  });
  return {
    id,
    objectTypeCode,
    status: "active",
    version: 1,
    fields: { code: field(id), name: field(id) },
    createdBy: "wangyun",
    createdAt: "2026-07-15T00:00:00Z",
    updatedBy: "wangyun",
    updatedAt: "2026-07-15T00:00:00Z",
  };
}
