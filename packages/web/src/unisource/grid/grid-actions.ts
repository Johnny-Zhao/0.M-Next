import type { DataFieldPrimitive, FieldDataType } from "../model/kernel";
import { pushToast } from "../primitives";
import { sessionStore, type SessionStore } from "../state/session-store";
import { workspaceStore, type WorkspaceStore } from "../state/workspace-store";

export interface CommitCellEditInput {
  readonly objectTypeCode: string;
  readonly objectId: string;
  readonly fieldCode: string;
  readonly dataType: FieldDataType;
  readonly rawValue: string;
  readonly session?: SessionStore;
  readonly workspace?: WorkspaceStore;
}

export type CommitCellEditResult =
  | {
      readonly kind: "written";
      readonly eventId: string;
      readonly refs: number;
    }
  | { readonly kind: "queued"; readonly changeSetId: string };

export function parseGridValue(
  rawValue: string,
  dataType: FieldDataType,
): DataFieldPrimitive {
  if (dataType === "number") {
    const trimmed = rawValue.trim();
    return trimmed === "" ? null : Number(trimmed);
  }
  return rawValue;
}

export function commitCellEdit(
  input: CommitCellEditInput,
): CommitCellEditResult {
  const session = input.session ?? sessionStore;
  const workspace = input.workspace ?? workspaceStore;
  const result = session.requestWrite({
    resourceCode: input.objectTypeCode,
    objectId: input.objectId,
    fieldCode: input.fieldCode,
    value: parseGridValue(input.rawValue, input.dataType),
  });
  if (result.queued) {
    pushToast({ title: "已提交审批", desc: "等待管理员确认" });
    return { kind: "queued", changeSetId: result.changeSetId };
  }
  pushToast({
    title: `已更新 · ${result.syncedRefs} 处引用已同步`,
    actions: [
      {
        label: "撤销",
        tone: "gold",
        onPress: () => workspace.undo(result.eventId),
      },
    ],
  });
  return {
    kind: "written",
    eventId: result.eventId,
    refs: result.syncedRefs,
  };
}
