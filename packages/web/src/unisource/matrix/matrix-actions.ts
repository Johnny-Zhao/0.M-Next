import type { DataFieldPrimitive, MemberId } from "../model/kernel";
import type { SessionStore, WriteRequestResult } from "../state/session-store";

export type MatrixMoveResult =
  | { readonly kind: "noop" }
  | ({ readonly kind: "written" } & WriteRequestResult);

export function canDragMatrixCard(memberId: MemberId): boolean {
  return memberId !== "zhouran" && memberId !== "ai";
}

export function moveMatrixCardColumn(params: {
  readonly session: SessionStore;
  readonly resourceCode: string;
  readonly objectId: string;
  readonly fieldCode: string;
  readonly fromValue: DataFieldPrimitive;
  readonly toValue: DataFieldPrimitive;
}): MatrixMoveResult {
  if (params.fromValue === params.toValue) return { kind: "noop" };
  const result = params.session.requestWrite({
    resourceCode: params.resourceCode,
    objectId: params.objectId,
    fieldCode: params.fieldCode,
    value: params.toValue,
  });
  return { kind: "written", ...result };
}
