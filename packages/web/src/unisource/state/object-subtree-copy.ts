import type {
  DataFieldPrimitive,
  DataObject,
  FieldCode,
  MemberId,
} from "../model/kernel";
import { traverseObjectSubtree } from "../model/object-subtree";
import type { WorkspaceStore } from "./workspace-store";

const terminalStatuses = new Set(["archived", "deleted", "soft-deleted"]);
const maxCopyDepth = 3;

export interface ObjectSubtreeCopyConfig {
  readonly followRelationTypes: readonly string[];
  readonly rebindRelationTypes: readonly string[];
  readonly maxDepth: number;
  readonly rootFields?: Readonly<Record<FieldCode, DataFieldPrimitive>>;
}

export type ObjectSubtreeCopyResult =
  | {
      readonly state: "completed";
      readonly objectId: string;
      readonly message: string | null;
    }
  | { readonly state: "validation-failed"; readonly message: string }
  | {
      readonly state: "partial-failure";
      readonly failedStep: string;
      readonly completedSteps: readonly string[];
      readonly message: string;
    };

export async function copyObjectSubtree(
  workspace: WorkspaceStore,
  rootObjectId: string,
  config: ObjectSubtreeCopyConfig,
  actor: MemberId,
): Promise<ObjectSubtreeCopyResult> {
  const root = workspace.getObject(rootObjectId);
  if (!root || terminalStatuses.has(root.status))
    return { state: "validation-failed", message: "当前记录不可复制。" };
  const subtree = traverseObjectSubtree(
    workspace.getSnapshot(),
    rootObjectId,
    config.followRelationTypes,
    Math.min(maxCopyDepth, config.maxDepth),
  );
  if (!subtree)
    return { state: "validation-failed", message: "当前记录不可复制。" };

  const originals = orderedOriginals(
    workspace,
    rootObjectId,
    subtree.objectIds,
  );
  const fieldsByObjectId = plannedFields(
    workspace,
    originals,
    rootObjectId,
    config.rootFields,
  );
  if (!fieldsByObjectId)
    return {
      state: "validation-failed",
      message: "副本编码冲突，请手工输入新的编码后重试。",
    };
  const copiedIds = new Map<string, string>();
  const completedSteps: string[] = [];
  for (const original of originals) {
    const copied = workspace.createObject({
      objectTypeCode: original.objectTypeCode,
      fields: fieldsByObjectId.get(original.id)!,
      actor,
      summary: "复制数据对象",
    });
    const write = await workspace.waitForLastWrite();
    if (write.state === "failed")
      return failure("创建复制对象", write.message, completedSteps);
    const copiedId =
      write.state === "synced" && write.objectId ? write.objectId : copied.id;
    copiedIds.set(original.id, copiedId);
    completedSteps.push(`创建 ${objectName(original)}`);
  }

  for (const relation of workspace.getSnapshot().relations) {
    if (relation.status !== "active") continue;
    const sourceId = copiedIds.get(relation.sourceId);
    const targetId = copiedIds.get(relation.targetId);
    const isFollow =
      subtree.relationIds.has(relation.id) && sourceId && targetId;
    const isRebind =
      sourceId &&
      config.rebindRelationTypes.includes(relation.relationTypeCode);
    if (!isFollow && !isRebind) continue;
    workspace.createRelation({
      relationTypeCode: relation.relationTypeCode,
      sourceId,
      targetId: isFollow ? targetId : relation.targetId,
      fields: relation.fields,
      actor,
      summary: "复制对象关系",
    });
    const write = await workspace.waitForLastWrite();
    if (write.state === "failed")
      return failure("创建复制关系", write.message, completedSteps);
    completedSteps.push(`复制 ${relation.relationTypeCode}`);
  }
  const copiedRootId = copiedIds.get(rootObjectId)!;
  const refresh = await workspace.refreshObjects([...copiedIds.values()]);
  return {
    state: "completed",
    objectId: copiedRootId,
    message:
      refresh.state === "failed"
        ? "副本已创建，但派生字段同步失败，请重新加载工作空间。"
        : null,
  };
}

function orderedOriginals(
  workspace: WorkspaceStore,
  rootObjectId: string,
  objectIds: ReadonlySet<string>,
): readonly DataObject[] {
  const originals = workspace
    .getSnapshot()
    .objects.filter((item) => objectIds.has(item.id));
  return originals.sort(
    (left, right) =>
      Number(right.id === rootObjectId) - Number(left.id === rootObjectId),
  );
}

function plannedFields(
  workspace: WorkspaceStore,
  originals: readonly DataObject[],
  rootObjectId: string,
  rootOverride: Readonly<Record<FieldCode, DataFieldPrimitive>> | undefined,
): ReadonlyMap<string, Record<FieldCode, DataFieldPrimitive>> | null {
  const usedCodes = new Map<string, Set<string>>();
  const planned = new Map<string, Record<FieldCode, DataFieldPrimitive>>();
  for (const object of originals) {
    const override = object.id === rootObjectId ? rootOverride : undefined;
    const type = workspace
      .getSnapshot()
      .objectTypes.find((item) => item.code === object.objectTypeCode);
    const fields = Object.fromEntries(
      (type?.fields ?? [])
        .filter((field) => !field.computed && !field.readOnly)
        .flatMap((field) =>
          object.fields[field.code]
            ? [[field.code, object.fields[field.code]!.value]]
            : [],
        ),
    ) as Record<FieldCode, DataFieldPrimitive>;
    const codes =
      usedCodes.get(object.objectTypeCode) ??
      existingCodes(workspace, object.objectTypeCode);
    usedCodes.set(object.objectTypeCode, codes);
    if ("code" in fields) {
      const code = override?.code
        ? String(override.code)
        : nextCopyCode(codes, String(fields.code));
      if (!code || codes.has(code)) return null;
      fields.code = code;
      codes.add(code);
    }
    if ("name" in fields && !override?.name)
      fields.name = `${String(fields.name)}（副本）`;
    if ("status" in fields) fields.status = "DRAFT";
    planned.set(object.id, { ...fields, ...override });
  }
  return planned;
}

function existingCodes(
  workspace: WorkspaceStore,
  objectTypeCode: string,
): Set<string> {
  return new Set(
    workspace
      .getSnapshot()
      .objects.filter((item) => item.objectTypeCode === objectTypeCode)
      .map((item) => String(item.fields.code?.value ?? "")),
  );
}

function nextCopyCode(used: ReadonlySet<string>, base: string): string | null {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const candidate = `${base}-COPY${attempt === 1 ? "" : attempt}`;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

function objectName(object: DataObject): string {
  return String(object.fields.name?.value ?? object.id);
}

function failure(
  failedStep: string,
  message: string,
  completedSteps: readonly string[],
): Extract<ObjectSubtreeCopyResult, { state: "partial-failure" }> {
  return {
    state: "partial-failure",
    failedStep,
    completedSteps,
    message: `${failedStep}失败：${message}。已完成步骤：${completedSteps.join("、") || "无"}。请重新加载工作空间后重试。`,
  };
}
