import type { ChangeSetState } from "../state/changeset-store";
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
    fieldRefCount: workspace.fieldRefs.length,
    expressions: workspace.expressions.map((expression) => ({
      id: expression.id,
      name: expression.name,
      forms: expression.viewIds
        .map(
          (viewId) => workspace.views.find((view) => view.id === viewId)?.kind,
        )
        .filter((form): form is UsFormKind => form !== undefined),
      defaultForm: expression.defaultForm,
      lastActivity: expression.lastActivity,
      avatarLabel:
        workspace.members
          .find((candidate) => candidate.id === "wangyun")
          ?.name.slice(0, 1) ?? "王",
    })),
    sources: workspace.objectTypes.map((type) => {
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
        ...sourceStatus(type.code),
      };
    }),
  };
}

function sourceStatus(code: string): {
  readonly status: string;
  readonly tone: HomeSourceTileVm["tone"];
} {
  if (code === "product_specs") {
    return { status: "今日 改 2 · 全部已同步", tone: "change" };
  }
  if (code === "channel_sales") {
    return { status: "自动刷新 5min", tone: "ok" };
  }
  if (code === "contracts") {
    return { status: "今日 增 1(AI 导入)", tone: "ok" };
  }
  return { status: "未被引用", tone: "muted" };
}
