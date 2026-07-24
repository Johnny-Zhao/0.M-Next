import { describe, expect, it, vi } from "vitest";

import { resolveExpressionView } from "../presentation/expression-runtime";
import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  createExpressionRecords,
  expressionFormOptions,
  expressionRelationOptions,
  initialExpressionDraft,
  validateExpressionDraft,
  type ExpressionDraft,
} from "./expression-create-model";

function draft(overrides: Partial<ExpressionDraft> = {}): ExpressionDraft {
  return {
    name: "产品方案表达",
    purpose: "用于统一查看产品",
    rootObjectTypeCode: "product_specs",
    fieldCodes: ["sku", "name", "price"],
    relations: [],
    viewKind: "grid",
    sortFieldCode: "sku",
    sortDirection: "asc",
    ...overrides,
  };
}

describe("expression create model", () => {
  it("rejects empty, duplicate, missing-root and mismatched fields", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const workspace = store.getSnapshot();
    expect(validateExpressionDraft(workspace, draft({ name: " " }))).toContain(
      "不能为空",
    );
    expect(
      validateExpressionDraft(
        workspace,
        draft({ name: workspace.expressions[0]!.name }),
      ),
    ).toContain("同名");
    expect(
      validateExpressionDraft(
        workspace,
        draft({ rootObjectTypeCode: "missing" }),
      ),
    ).toContain("根对象类型");
    expect(
      validateExpressionDraft(workspace, draft({ fieldCodes: ["missing"] })),
    ).toContain("不属于");
  });

  it("derives fields, typed relation directions and form capability from metadata", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const initial = initialExpressionDraft(workspace);
    const relations = expressionRelationOptions(
      workspace.relationTypes,
      "product_specs",
    );
    const forms = expressionFormOptions(workspace, draft());

    expect(initial.rootObjectTypeCode).toBe(workspace.objectTypes[0]?.code);
    expect(initial.fieldCodes).toEqual(
      workspace.objectTypes[0]?.fields.slice(0, 3).map((field) => field.code),
    );
    expect(relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationTypeCode: "interconnects_with",
          direction: "out",
        }),
        expect.objectContaining({
          relationTypeCode: "interconnects_with",
          direction: "in",
        }),
      ]),
    );
    expect(forms.map((form) => form.kind)).toEqual([
      "grid",
      "doc",
      "canvas",
      "matrix",
      "bi",
      "ana",
    ]);
    expect(forms.find((form) => form.kind === "doc")?.reason).toContain(
      "文档模型",
    );
    expect(forms.find((form) => form.kind === "ana")?.reason).toContain(
      "分析报告",
    );
  });

  it("atomically creates consistent Expression and first View without copying facts", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    const ids = ["expression-id", "view-id"];

    const result = store.createExpressionWithView(draft(), {
      idFactory: () => ids.shift()!,
      createdAt: "2026-07-22T10:00:00Z",
    });
    expect(result.state).toBe("created");
    if (result.state !== "created") return;
    expect(result.expression).toMatchObject({
      id: "exp-expression-id",
      viewIds: ["view-view-id"],
      defaultViewId: "view-view-id",
      defaultForm: "grid",
    });
    expect(result.view).toMatchObject({
      id: "view-view-id",
      exprId: "exp-expression-id",
      kind: "grid",
    });
    const after = store.getSnapshot();
    expect(after.objects).toBe(before.objects);
    expect(after.relations).toBe(before.relations);
    expect(after.objectTypes).toBe(before.objectTypes);
    expect(listener).toHaveBeenCalledOnce();
    expect(
      resolveExpressionView(after, result.expression.id, "grid").state,
    ).toBe("ready");
  });

  it("does not leave an orphan View when validation or id generation fails", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const before = store.getSnapshot();
    const duplicate = store.createExpressionWithView(
      draft({ name: before.expressions[0]!.name }),
    );
    expect(duplicate.state).toBe("invalid");
    expect(store.getSnapshot()).toBe(before);

    const existingId = before.expressions[0]!.id.replace(/^exp-/, "");
    const failedIds = createExpressionRecords(
      before,
      draft(),
      () => existingId,
    );
    expect(failedIds).toEqual({
      state: "invalid",
      message: "无法生成唯一表达标识，请重试。",
    });
    expect(store.getSnapshot().views).toBe(before.views);
  });

  it("builds generic configs for PC and non-PC metadata without domain literals", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    for (const viewKind of ["grid", "canvas", "matrix", "bi"] as const) {
      const created = createExpressionRecords(
        workspace,
        draft({ name: `通用-${viewKind}`, viewKind }),
        (() => {
          let value = 0;
          return () => `${viewKind}-${value++}`;
        })(),
      );
      expect(created.state).toBe("created");
      expect(JSON.stringify(created)).not.toContain("pc_procurement");
      expect(JSON.stringify(created)).not.toContain("build_plan");
    }
  });
});
