import type { ChangeSet, MemberId } from "../model/kernel";
import type { Member } from "../model/view-layer";
import { UsButton, UsMonoTag, pushToast } from "../primitives";
import { changeSetStore } from "../state/changeset-store";
import type { WorkspaceState } from "../state/workspace-store";

export function ApprovalCard({
  approver,
  members,
  pending,
  workspace,
}: {
  readonly approver: MemberId;
  readonly members: readonly Member[];
  readonly pending: readonly ChangeSet[];
  readonly workspace: WorkspaceState;
}) {
  return (
    <section className="us-approval">
      <header>
        <span>待审批</span>
        <UsMonoTag tone="change">PENDING {pending.length}</UsMonoTag>
      </header>
      {pending.length === 0 ? (
        <p className="us-approval__empty">当前没有待审批写入。</p>
      ) : (
        pending.map((changeSet) => (
          <article className="us-approval-card" key={changeSet.id}>
            <strong>{memberName(members, changeSet.actor)} 请求修改</strong>
            <p className="us-data">{describeChangeSet(workspace, changeSet)}</p>
            <small>批准后按统一数据源规则同步相关字段引用。</small>
            <div>
              <UsButton
                onClick={() => {
                  const result = changeSetStore.approveChangeSet(
                    changeSet.id,
                    approver,
                  );
                  pushToast({
                    title: result.ok ? "已批准并写入" : result.reason,
                  });
                }}
                size="sm"
                variant="primary"
              >
                批准并写入
              </UsButton>
              <UsButton
                onClick={() => {
                  const result = changeSetStore.rejectChangeSet(
                    changeSet.id,
                    approver,
                  );
                  pushToast({
                    title: result.ok ? "已拒绝" : result.reason,
                  });
                }}
                size="sm"
                variant="secondary"
              >
                拒绝
              </UsButton>
            </div>
          </article>
        ))
      )}
      <p className="us-approval__foot">
        表达可自由转发分享;打开时字段值按查看者的数据源权限显示。
      </p>
    </section>
  );
}

function memberName(members: readonly Member[], memberId: MemberId): string {
  return members.find((member) => member.id === memberId)?.name ?? memberId;
}

function describeChangeSet(
  workspace: WorkspaceState,
  changeSet: ChangeSet,
): string {
  const item =
    changeSet.items.find((candidate) => candidate.applied !== true) ??
    changeSet.items[0];
  if (!item) return changeSet.title;
  const object = workspace.objects.find(
    (candidate) => candidate.id === item.target.entityId,
  );
  const type = workspace.objectTypes.find(
    (candidate) => candidate.code === object?.objectTypeCode,
  );
  const field = type?.fields.find(
    (candidate) => candidate.code === item.target.fieldCode,
  );
  const path = `${type?.name ?? "数据源"} › ${object?.fields.name?.value ?? object?.fields.channel?.value ?? item.target.entityId} › ${
    field?.name ?? item.target.fieldCode ?? "对象"
  }`;
  return `${path}: ${String(item.oldValue ?? "空")} → ${String(
    item.nextValue ?? item.fields?.name ?? "新对象",
  )}`;
}
