import { UsButton } from "../primitives";
import { FullLayout } from "../shell/layouts";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { PageSkeleton } from "./page-skeleton";

export function AccessPage() {
  const snapshot = useWorkspaceSnapshot();
  const humanMembers = snapshot.members.filter((member) => member.id !== "ai");
  return (
    <FullLayout
      chrome={{
        breadcrumb: [{ label: "设置" }, { label: "成员与权限" }],
        breadcrumbTail: <span className="us-data">ACCESS</span>,
        sync: {
          state: "ok",
          label: `${humanMembers.length} 位成员 + 同源 AI 代理`,
        },
        actions: <UsButton variant="emphasis">邀请成员</UsButton>,
      }}
    >
      <PageSkeleton
        kicker="ACCESS · v1"
        title="权限模型"
        desc="P1 实现:权限矩阵(管理/编辑/所有者/只读/无)、成员能力清单、待审批卡(批准并写入/拒绝);AI 随发起人权限,越权转审批。"
      />
    </FullLayout>
  );
}
