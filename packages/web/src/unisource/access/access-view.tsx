import { useMemo, useState } from "react";

import type { ChangeSet, MemberId } from "../model/kernel";
import { UsButton, UsMonoTag } from "../primitives";
import { useChangeSetSnapshot } from "../state/changeset-store";
import { useSessionSnapshot } from "../state/session-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { ApprovalCard } from "./approval-card";
import { MemberDetail } from "./member-detail";
import { PermissionMatrixView } from "./permission-matrix";

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
        isApprovalPending(changeSet, workspace),
      ),
    [changes.changeSets, workspace],
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
              能编辑看板布局的人,不一定能修改售价;字段引用永远按数据源权限鉴权。
            </span>
          </div>
          <PermissionMatrixView
            members={workspace.members}
            onSelectMember={setSelectedMemberId}
            permissions={workspace.permissions}
            selectedMemberId={selectedMemberId}
          />
          <p className="us-access-foot">
            陈默(琥珀行):数据只读 + 表达可编辑 — 能重排看板,改不了售价。
            空间角色为前端 G2 投影,仅用于演示可见性;内核仍按当前 actor
            自行鉴权。
          </p>
        </main>
        <aside className="us-access-side">
          <MemberDetail member={selected} permissions={workspace.permissions} />
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
): boolean {
  if (changeSet.status !== "pending") return false;
  if (changeSet.source === "manual") return true;
  const level = workspace.permissions[changeSet.actor]?.product_specs ?? "none";
  return changeSet.source === "ai" && level !== "admin";
}
