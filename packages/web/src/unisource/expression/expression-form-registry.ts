import type { ViewKind } from "../model/kernel";

export interface RegisteredExpressionForm {
  readonly kind: ViewKind;
  readonly label: string;
}

export const REGISTERED_EXPRESSION_FORMS: readonly RegisteredExpressionForm[] =
  [
    { kind: "grid", label: "数据列表 GRID" },
    { kind: "doc", label: "结构化文档 DOC" },
    { kind: "canvas", label: "关系画布 CANVAS" },
    { kind: "matrix", label: "对比矩阵 MATRIX" },
    { kind: "bi", label: "指标看板 BI" },
    { kind: "ana", label: "分析视图 ANA" },
  ];
