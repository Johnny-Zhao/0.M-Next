import type { ChangeSetState } from "../state/changeset-store";
import type { Member } from "../model/view-layer";
import type { UsFormKind } from "../routes-paths";
import type { SessionState } from "../state/session-store";
import type { WorkspaceState } from "../state/workspace-store";

export interface HomeExprCardVm {
  readonly id: string;
  readonly name: string;
  readonly forms: readonly string[];
  readonly defaultForm: string;
  readonly lastActivity: string;
  readonly avatarLabel: string;
  readonly activityAvatar: Member["avatar"];
}

export interface HomeSourceTileVm {
  readonly code: string;
  readonly name: string;
  readonly count: number;
  readonly refCount: number;
  readonly status: string;
  readonly tone: "change" | "ok" | "muted";
}

export interface HomeVm {
  readonly workspaceName: string;
  readonly currentMemberName: string;
  readonly pendingCount: number;
  readonly pendingAiCount: number;
  readonly fieldRefCount: number;
  readonly expressions: readonly HomeExprCardVm[];
  readonly sources: readonly HomeSourceTileVm[];
}

export function deriveHomeVm(
  workspace: WorkspaceState,
  changeSets: ChangeSetState,
  session: SessionState,
): HomeVm {
  const pending = changeSets.changeSets.filter(
    (changeSet) => changeSet.status === "pending",
  );
  const member =
    workspace.members.find(
      (candidate) => candidate.id === session.currentMemberId,
    ) ?? workspace.members[0];
  return {
    workspaceName: workspace.workspace.name,
    currentMemberName: member?.name ?? "成员",
    pendingCount: pending.length,
    pendingAiCount: pending.filter((changeSet) => changeSet.source === "ai")
      .length,
    fieldRefCount: workspace.fieldRefs.filter((ref) =>
      workspace.expressions.some(
        (expression) =>
          expression.id === ref.exprId &&
          (expression.space ?? "main") === "main",
      ),
    ).length,
    expressions: workspace.expressions
      .filter((expression) => (expression.space ?? "main") === "main")
      .map((expression) => {
        const forms = expression.viewIds
          .map(
            (viewId) =>
              workspace.views.find((view) => view.id === viewId)?.kind,
          )
          .filter((form): form is UsFormKind => form !== undefined);
        const activityMember =
          workspace.members.find(
            (candidate) => candidate.id === expression.activityMember,
          ) ?? workspace.members[0];
        return {
          id: expression.id,
          name: expression.name,
          forms: preferDefaultForm(forms, expression.defaultForm),
          defaultForm: expression.defaultForm,
          lastActivity: expression.lastActivity,
          avatarLabel: activityMember?.name.slice(0, 1) ?? "?",
          activityAvatar: activityMember?.avatar ?? "ai",
        };
      }),
    sources: workspace.objectTypes
      .filter((type) => !isWorkshopOnlySource(workspace, type.code))
      .map((type) => {
        const objects = workspace.objects.filter(
          (object) => object.objectTypeCode === type.code,
        );
        const objectIds = new Set(objects.map((object) => object.id));
        const refCount = new Set(
          workspace.fieldRefs
            .filter((ref) => objectIds.has(ref.objectId))
            .map((ref) => ref.exprId),
        ).size;
        return {
          code: type.code,
          name: type.name,
          count: objects.length,
          refCount,
          ...sourceStatus(refCount),
        };
      }),
  };
}

function isWorkshopOnlySource(
  workspace: WorkspaceState,
  objectTypeCode: string,
): boolean {
  const objectIds = new Set(
    workspace.objects
      .filter((object) => object.objectTypeCode === objectTypeCode)
      .map((object) => object.id),
  );
  const expressionIds = new Set(
    workspace.fieldRefs
      .filter((ref) => objectIds.has(ref.objectId))
      .map((ref) => ref.exprId),
  );
  return (
    expressionIds.size > 0 &&
    [...expressionIds].every(
      (exprId) =>
        workspace.expressions.find((expression) => expression.id === exprId)
          ?.space === "workshop",
    )
  );
}

function preferDefaultForm(
  forms: readonly UsFormKind[],
  defaultForm: UsFormKind,
): readonly UsFormKind[] {
  const unique = Array.from(new Set(forms));
  return [
    defaultForm,
    ...unique.filter((candidate) => candidate !== defaultForm),
  ];
}

function sourceStatus(refCount: number): {
  readonly status: string;
  readonly tone: HomeSourceTileVm["tone"];
} {
  return refCount > 0
    ? { status: `已用于 ${refCount} 个表达`, tone: "ok" }
    : { status: "未被引用", tone: "muted" };
}
