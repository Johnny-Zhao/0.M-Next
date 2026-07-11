import { UsButton } from "../primitives";
import { FullLayout } from "../shell/layouts";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { PageSkeleton } from "./page-skeleton";

export function ValidatePage() {
  const snapshot = useWorkspaceSnapshot();
  const errors = snapshot.checkResults.filter(
    (result) => result.level === "error",
  ).length;
  const warnings = snapshot.checkResults.filter(
    (result) => result.level === "warning",
  ).length;
  return (
    <FullLayout
      chrome={{
        breadcrumb: [{ label: "统一数据源" }, { label: "校验中心" }],
        breadcrumbTail: <span className="us-data">VALIDATE</span>,
        sync: {
          state: errors > 0 ? "danger" : warnings > 0 ? "change" : "ok",
          label: `${errors} 错误 · ${warnings} 警告 · ${snapshot.checkResults.length} 条规则`,
        },
        actions: <UsButton variant="emphasis">立即运行</UsButton>,
      }}
    >
      <PageSkeleton
        kicker="VALIDATE · v1"
        title="校验中心"
        desc="P1 实现:规则组导航(11 条规则)、错误/警告/通过三态卡、权威 vs 缓存对照与修复动作;错误存在时阻断分享/导出。"
      />
    </FullLayout>
  );
}
