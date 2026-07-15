import { useMemo, useState } from "react";

import type { ChangeSet, MemberId } from "../model/kernel";
import { UsButton, UsMonoTag } from "../primitives";
import { useChangeSetSnapshot } from "../state/changeset-store";
import { useSessionSnapshot } from "../state/session-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { ApprovalCard } from "./approval-card";
import { MemberDetail } from "./member-detail";
import { PermissionMatrixView } from "./permission-matrix";
import type { PermissionResource } from "./permission-matrix";

export function AccessView() {
  const workspace = useWorkspaceSnapshot();
  const changes = useChangeSetSnapshot();
  const session = useSessionSnapshot();
  const [selectedMemberId, setSelectedMemberId] = useState<MemberId>("chenmo");
  const selected =
    workspace.members.find((member) => member.id === selectedMemberId) ??
    workspace.members[0];
  const pending = useMemo(
    () =>
      changes.changeSets.filter((changeSet) =>
        isApprovalPending(changeSet, workspace, workspace.objectTypes[0]?.code),
      ),
    [changes.changeSets, workspace],
  );
  const resources = useMemo<readonly PermissionResource[]>(
    () => [
      ...workspace.objectTypes.slice(0, 2).map((type, index) => ({
        code: type.code,
        label: type.name,
        icon: index === 0 ? "▦" : "▤",
        kind: "data" as const,
      })),
      ...workspace.expressions.slice(0, 2).map((expression, index) => ({
        code: expression.id,
        label: expression.name,
        icon: index === 0 ? "▥" : "▧",
        kind: "expression" as const,
      })),
    ],
    [workspace.expressions, workspace.objectTypes],
  );
  if (!selected) return null;
  return (
    <section className="us-access">
      <header className="us-access-head">
        <div>
          <span>设置 › 成员与权限</span>
          <UsMonoTag tone="primary">ACCESS</UsMonoTag>
        </div>
        <UsButton variant="emphasis">邀请成员</UsButton>
      </header>
      <div className="us-access-grid">
        <main className="us-access-main">
          <div className="us-access-note">
            <strong>数据源权限与表达权限相互独立。</strong>
            <span>
              能编辑表达布局的人,不一定能修改数据字段;字段引用始终按数据源权限鉴权。
            </span>
          </div>
          <PermissionMatrixView
            members={workspace.members}
            onSelectMember={setSelectedMemberId}
            permissions={workspace.permissions}
            resources={resources}
            selectedMemberId={selectedMemberId}
          />
          <p className="us-access-foot">
            数据源与表达权限分别展示。空间角色为前端 G2
            投影,仅用于演示可见性;内核仍按当前 actor 自行鉴权。
          </p>
        </main>
        <aside className="us-access-side">
          <MemberDetail
            member={selected}
            permissions={workspace.permissions}
            resources={resources}
          />
          <ApprovalCard
            approver={session.currentMemberId}
            members={workspace.members}
            pending={pending}
            workspace={workspace}
          />
        </aside>
      </div>
    </section>
  );
}

function isApprovalPending(
  changeSet: ChangeSet,
  workspace: ReturnType<typeof useWorkspaceSnapshot>,
  primaryResourceCode: string | undefined,
): boolean {
  if (changeSet.status !== "pending") return false;
  if (changeSet.source === "manual") return true;
  const level = primaryResourceCode
    ? (workspace.permissions[changeSet.actor]?.[primaryResourceCode] ?? "none")
    : "none";
  return changeSet.source === "ai" && level !== "admin";
}
