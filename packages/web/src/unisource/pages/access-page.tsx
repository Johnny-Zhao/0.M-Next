import { UsButton } from "../primitives";
import { FullLayout } from "../shell/layouts";
import { useChangeSetSnapshot } from "../state/changeset-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { AccessView } from "../access/access-view";

export function AccessPage() {
  const snapshot = useWorkspaceSnapshot();
  const changes = useChangeSetSnapshot();
  const humanMembers = snapshot.members.filter((member) => member.id !== "ai");
  const pending = changes.changeSets.filter(
    (changeSet) => changeSet.status === "pending",
  ).length;
  return (
    <FullLayout
      chrome={{
        breadcrumb: [{ label: "设置" }, { label: "成员与权限" }],
        breadcrumbTail: <span className="us-data">ACCESS</span>,
        sync: {
          state: "ok",
          label: `${humanMembers.length} 位成员 · ${pending} 待审批`,
        },
        actions: <UsButton variant="emphasis">邀请成员</UsButton>,
      }}
    >
      <AccessView />
    </FullLayout>
  );
}
