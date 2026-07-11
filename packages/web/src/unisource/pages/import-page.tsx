import { ImportView } from "../import/import-view";
import { WorkspaceLayout } from "../shell/layouts";
import { useChangeSetSnapshot } from "../state/changeset-store";

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
      <ImportView />
    </WorkspaceLayout>
  );
}
