import { WorkspaceLayout } from "../shell/layouts";
import { useChangeSetSnapshot } from "../state/changeset-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { PageSkeleton } from "./page-skeleton";

export function HomePage() {
  const snapshot = useWorkspaceSnapshot();
  const changeSets = useChangeSetSnapshot();
  const workspace = snapshot.workspace;
  const lead = snapshot.members[0];
  const pending = changeSets.changeSets.filter(
    (changeSet) => changeSet.status === "pending",
  ).length;
  return (
    <WorkspaceLayout
      chrome={{
        breadcrumb: [
          { label: `空间:${workspace.name}` },
          { label: "首页总览" },
        ],
        sync: {
          state: pending > 0 ? "change" : "ok",
          label: `${snapshot.fieldRefs.length} 处引用 · ${pending} 个待确认`,
        },
        people: lead
          ? [
              {
                member: lead.avatar,
                label: lead.name.slice(0, 1),
                title: lead.name,
              },
            ]
          : undefined,
      }}
    >
      <PageSkeleton
        kicker="HOME · v2"
        title="首页总览"
        desc="P1 实现:问候区、表达卡 ×6、数据源卡 ×4、待确认横幅与「最近变更」活动流(数据轨琥珀 / 表达轨蓝灰)。"
      />
    </WorkspaceLayout>
  );
}
