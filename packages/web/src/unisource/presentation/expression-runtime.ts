import type { ViewDef, ViewKind } from "../model/kernel";
import type { Expression } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";

export type ExpressionResolutionState =
  | "ready"
  | "expressionMissing"
  | "viewMissing"
  | "kindMismatch";

export interface ExpressionResolution {
  readonly state: ExpressionResolutionState;
  readonly expression: Expression | null;
  readonly view: ViewDef | null;
  readonly form: ViewKind;
  readonly forms: readonly ViewKind[];
  readonly message: string | null;
}

type ExpressionRuntimeState = Pick<WorkspaceState, "expressions" | "views">;

export function resolveExpressionView(
  workspace: ExpressionRuntimeState,
  exprId: string | undefined,
  form: ViewKind,
): ExpressionResolution {
  const expression = workspace.expressions.find(
    (candidate) => candidate.id === exprId,
  );
  if (!expression) return unavailable("expressionMissing", null, form);
  const expressionViews = expression.viewIds.flatMap((viewId) => {
    const view = workspace.views.find((candidate) => candidate.id === viewId);
    return view?.exprId === expression.id ? [view] : [];
  });
  const forms = uniqueForms(expressionViews);
  const viewId =
    form === expression.defaultForm
      ? expression.defaultViewId
      : expressionViews.find((view) => view.kind === form)?.id;
  if (!viewId) {
    return unavailable("viewMissing", expression, form, forms);
  }
  const view = workspace.views.find((candidate) => candidate.id === viewId);
  if (!view) return unavailable("viewMissing", expression, form, forms);
  if (view.exprId !== expression.id || view.kind !== form) {
    return unavailable("kindMismatch", expression, form, forms);
  }
  return {
    state: "ready",
    expression,
    view,
    form,
    forms,
    message: null,
  };
}

function uniqueForms(views: readonly ViewDef[]): readonly ViewKind[] {
  return Array.from(new Set(views.map((view) => view.kind)));
}

function unavailable(
  state: Exclude<ExpressionResolutionState, "ready">,
  expression: Expression | null,
  form: ViewKind,
  forms: readonly ViewKind[] = [],
): ExpressionResolution {
  const message =
    state === "expressionMissing"
      ? "表达不存在"
      : state === "kindMismatch"
        ? "表达视图类型与当前形式不匹配"
        : "当前形式未配置可用视图";
  return { state, expression, view: null, form, forms, message };
}
