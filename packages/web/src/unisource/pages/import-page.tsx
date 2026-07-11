import { WorkspaceLayout } from "../shell/layouts";
import { useChangeSetSnapshot } from "../state/changeset-store";
import { PageSkeleton } from "./page-skeleton";

export function ImportPage() {
  const pendingAi = useChangeSetSnapshot().changeSets.filter(
    (changeSet) => changeSet.source === "ai" && changeSet.status === "pending",
  ).length;
  return (
    <WorkspaceLayout
      sidebarTab="data"
      chrome={{
        breadcrumb: [{ label: "统一数据源" }, { label: "AI 导入" }],
        sync: { state: "change", label: `${pendingAi} 个 AI 变更集待确认` },
      }}
    >
      <PageSkeleton
        kicker="IMPORT · v2"
        title="AI 导入"
        desc="P1 实现:4 步进度器(输入→语义匹配→定位增删改→写入)、原文实体高亮、语义匹配 chips、增删改清单与置信度门控(低置信未确认时禁用「确认写入」)。"
      />
    </WorkspaceLayout>
  );
}
