import type {
  ObjectTypeDef,
  RelationType,
  ViewDef,
  ViewKind,
  Workspace,
} from "../model/kernel";
import type { Expression } from "../model/view-layer";
import { REGISTERED_EXPRESSION_FORMS } from "./expression-form-registry";

export interface ExpressionRelationDraft {
  readonly relationTypeCode: string;
  readonly direction: "out" | "in";
}

export interface ExpressionDraft {
  readonly name: string;
  readonly purpose: string;
  readonly rootObjectTypeCode: string;
  readonly fieldCodes: readonly string[];
  readonly relations: readonly ExpressionRelationDraft[];
  readonly viewKind: ViewKind;
  readonly sortFieldCode: string;
  readonly sortDirection: "asc" | "desc";
}

export interface ExpressionFormOption {
  readonly kind: ViewKind;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string | null;
}

export interface ExpressionRelationOption extends ExpressionRelationDraft {
  readonly key: string;
  readonly label: string;
}

export type ExpressionCreateResult =
  | {
      readonly state: "created";
      readonly expression: Expression;
      readonly view: ViewDef;
    }
  | { readonly state: "invalid"; readonly message: string };

export type ExpressionConfigPreparation =
  | {
      readonly state: "prepared";
      readonly input: {
        readonly name: string;
        readonly space: "main" | "workshop";
        readonly defaultForm: ViewKind;
        readonly view: {
          readonly kind: ViewKind;
          readonly config: Readonly<Record<string, unknown>>;
        };
      };
    }
  | { readonly state: "invalid"; readonly message: string };

interface ExpressionWorkspace {
  readonly workspace: Workspace;
  readonly expressions: readonly Expression[];
  readonly views: readonly ViewDef[];
  readonly objectTypes: readonly ObjectTypeDef[];
  readonly relationTypes: readonly RelationType[];
}

export function initialExpressionDraft(workspace: {
  readonly objectTypes: readonly ObjectTypeDef[];
}): ExpressionDraft {
  const root = workspace.objectTypes[0];
  const fieldCodes = root?.fields.slice(0, 3).map((field) => field.code) ?? [];
  return {
    name: "",
    purpose: "",
    rootObjectTypeCode: root?.code ?? "",
    fieldCodes,
    relations: [],
    viewKind: "grid",
    sortFieldCode: fieldCodes[0] ?? "",
    sortDirection: "asc",
  };
}

export function expressionRelationOptions(
  relationTypes: readonly RelationType[],
  rootObjectTypeCode: string,
): readonly ExpressionRelationOption[] {
  return relationTypes.flatMap((relation) => {
    const options: ExpressionRelationOption[] = [];
    if (relation.sourceTypeCode === rootObjectTypeCode) {
      options.push(relationOption(relation, "out"));
    }
    if (relation.targetTypeCode === rootObjectTypeCode) {
      options.push(relationOption(relation, "in"));
    }
    return options;
  });
}

export function expressionFormOptions(
  workspace: Pick<ExpressionWorkspace, "objectTypes" | "relationTypes">,
  draft: ExpressionDraft,
): readonly ExpressionFormOption[] {
  const root = workspace.objectTypes.find(
    (type) => type.code === draft.rootObjectTypeCode,
  );
  const fields = validSelectedFields(root, draft.fieldCodes);
  const inboundCanvasRelation = draft.relations.some(
    (relation) => relation.direction === "in",
  );
  return REGISTERED_EXPRESSION_FORMS.map((form) => {
    const reason = formDisabledReason(
      form.kind,
      root,
      fields,
      inboundCanvasRelation,
    );
    return { ...form, enabled: reason === null, reason };
  });
}

export function createExpressionRecords(
  workspace: ExpressionWorkspace,
  draft: ExpressionDraft,
  idFactory: () => string = () => crypto.randomUUID(),
  createdAt = new Date().toISOString(),
): ExpressionCreateResult {
  const prepared = prepareExpressionConfig(workspace, draft);
  if (prepared.state === "invalid") return prepared;
  const expressionId = uniqueId(
    "exp",
    workspace.expressions.map((item) => item.id),
    idFactory,
  );
  const viewId = uniqueId(
    "view",
    workspace.views.map((item) => item.id),
    idFactory,
  );
  if (!expressionId || !viewId) {
    return { state: "invalid", message: "无法生成唯一表达标识，请重试。" };
  }
  const { input } = prepared;
  const expression: Expression = {
    id: expressionId,
    name: input.name,
    space: input.space,
    viewIds: [viewId],
    defaultViewId: viewId,
    defaultForm: draft.viewKind,
    activityMember: workspace.workspace.currentMemberId,
    lastActivity: createdAt,
  };
  return {
    state: "created",
    expression,
    view: {
      id: viewId,
      exprId: expressionId,
      kind: input.view.kind,
      config: input.view.config,
    },
  };
}

export function prepareExpressionConfig(
  workspace: ExpressionWorkspace,
  draft: ExpressionDraft,
): ExpressionConfigPreparation {
  const validation = validateExpressionDraft(workspace, draft);
  if (validation) return { state: "invalid", message: validation };
  const name = draft.name.trim();
  return {
    state: "prepared",
    input: {
      name,
      space: "main",
      defaultForm: draft.viewKind,
      view: {
        kind: draft.viewKind,
        config: buildInitialViewConfig(draft, name),
      },
    },
  };
}

export function validateExpressionDraft(
  workspace: ExpressionWorkspace,
  draft: ExpressionDraft,
): string | null {
  const name = draft.name.trim();
  if (!name) return "表达名称不能为空。";
  const duplicate = workspace.expressions.some(
    (expression) =>
      expression.name.trim().toLocaleLowerCase("zh-CN") ===
      name.toLocaleLowerCase("zh-CN"),
  );
  if (duplicate) return "当前工作空间已存在同名表达。";
  const root = workspace.objectTypes.find(
    (type) => type.code === draft.rootObjectTypeCode,
  );
  if (!root) return "请选择当前工作空间中的根对象类型。";
  if (
    validSelectedFields(root, draft.fieldCodes).length !==
    draft.fieldCodes.length
  ) {
    return "所选字段不属于当前根对象类型。";
  }
  if (!relationsAreValid(workspace.relationTypes, root.code, draft.relations)) {
    return "所选关系的类型或方向与根对象类型不匹配。";
  }
  if (
    draft.viewKind === "grid" &&
    !draft.fieldCodes.includes(draft.sortFieldCode)
  ) {
    return "默认排序字段必须是已选择的 GRID 列。";
  }
  const form = expressionFormOptions(workspace, draft).find(
    (option) => option.kind === draft.viewKind,
  );
  return form?.enabled ? null : (form?.reason ?? "首个描述形式不可用。");
}

function buildInitialViewConfig(
  draft: ExpressionDraft,
  name: string,
): Record<string, unknown> {
  const purpose = draft.purpose.trim();
  const relationScopes = draft.relations.map((relation) => ({ ...relation }));
  const outboundRelations = draft.relations
    .filter((relation) => relation.direction === "out")
    .map((relation) => relation.relationTypeCode);
  if (draft.viewKind === "grid") {
    return {
      objectTypeCode: draft.rootObjectTypeCode,
      columns: [...draft.fieldCodes],
      defaultSort: {
        fieldCode: draft.sortFieldCode,
        direction: draft.sortDirection,
      },
      pageSize: 25,
      title: name,
      description: purpose,
      relationScopes,
    };
  }
  if (draft.viewKind === "canvas") {
    return {
      selectionObjectTypeCode: draft.rootObjectTypeCode,
      selectionRelationTypeCodes: outboundRelations,
      selectionDepth: 2,
      objectTypeCodes: [draft.rootObjectTypeCode],
      relationScopes,
      nodes: [],
      edges: [],
      title: name,
      description: purpose,
    };
  }
  if (draft.viewKind === "matrix") {
    return {
      sourceTypeCode: draft.rootObjectTypeCode,
      rowField: draft.fieldCodes[0],
      colField: draft.fieldCodes[1],
      cardFields: draft.fieldCodes.slice(2),
      summary: "count",
      allowColumnMove: false,
      relationScopes,
      title: name,
      description: purpose,
    };
  }
  if (draft.viewKind === "bi") {
    return {
      title: name,
      description: purpose,
      objectTypeCodes: [draft.rootObjectTypeCode],
      relationScopes,
      metrics: draft.fieldCodes.map((fieldCode) => ({
        id: `${draft.rootObjectTypeCode}-${fieldCode}`,
        kind: "field",
        objectTypeCode: draft.rootObjectTypeCode,
        fieldCode,
        label: fieldCode,
        sourceLabel: fieldCode,
      })),
    };
  }
  return { title: name, description: purpose, relationScopes };
}

function formDisabledReason(
  kind: ViewKind,
  root: ObjectTypeDef | undefined,
  fields: readonly string[],
  inboundCanvasRelation: boolean,
): string | null {
  if (!root) return "请先选择根对象类型。";
  if (kind === "doc") return "DOC 还需要既有文档模型，本卡不创建附加模型。";
  if (kind === "ana") return "ANA 还需要既有分析报告，本卡不创建附加模型。";
  if (kind === "canvas" && inboundCanvasRelation) {
    return "当前画布仅支持从根对象向外遍历关系。";
  }
  if (kind === "matrix" && fields.length < 2)
    return "MATRIX 至少需要两个字段。";
  if ((kind === "grid" || kind === "bi") && fields.length === 0) {
    return `${kind.toUpperCase()} 至少需要一个字段。`;
  }
  return null;
}

function validSelectedFields(
  root: ObjectTypeDef | undefined,
  fieldCodes: readonly string[],
): readonly string[] {
  if (!root) return [];
  const available = new Set(root.fields.map((field) => field.code));
  return Array.from(new Set(fieldCodes)).filter((fieldCode) =>
    available.has(fieldCode),
  );
}

function relationsAreValid(
  relationTypes: readonly RelationType[],
  rootTypeCode: string,
  selected: readonly ExpressionRelationDraft[],
): boolean {
  const available = new Set(
    expressionRelationOptions(relationTypes, rootTypeCode).map(
      (option) => option.key,
    ),
  );
  return selected.every((relation) => available.has(relationKey(relation)));
}

function relationOption(
  relation: RelationType,
  direction: ExpressionRelationDraft["direction"],
): ExpressionRelationOption {
  const target =
    direction === "out" ? relation.targetTypeCode : relation.sourceTypeCode;
  return {
    relationTypeCode: relation.code,
    direction,
    key: relationKey({ relationTypeCode: relation.code, direction }),
    label: `${relation.name} · ${direction === "out" ? "向外" : "向内"} · ${target}`,
  };
}

export function relationKey(relation: ExpressionRelationDraft): string {
  return `${relation.relationTypeCode}:${relation.direction}`;
}

function uniqueId(
  prefix: string,
  existingIds: readonly string[],
  idFactory: () => string,
): string | null {
  const existing = new Set(existingIds);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${prefix}-${idFactory()}`;
    if (!existing.has(candidate)) return candidate;
  }
  return null;
}
