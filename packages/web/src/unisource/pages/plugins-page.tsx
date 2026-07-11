import { UsButton } from "../primitives";
import { FullLayout } from "../shell/layouts";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { PageSkeleton } from "./page-skeleton";

export function PluginsPage() {
  const snapshot = useWorkspaceSnapshot();
  const enabled = snapshot.plugins.filter((plugin) => plugin.enabled).length;
  return (
    <FullLayout
      chrome={{
        breadcrumb: [{ label: "设置" }, { label: "插件中心" }],
        breadcrumbTail: <span className="us-data">PLUGINS</span>,
        sync: {
          state: "ok",
          label: `${enabled}/${snapshot.plugins.length} 个插件已启用`,
        },
        actions: (
          <>
            <UsButton>开发者文档</UsButton>
            <UsButton variant="emphasis">提交插件</UsButton>
          </>
        ),
      }}
    >
      <PageSkeleton
        kicker="PLUGINS · v1"
        title="插件中心"
        desc="P2 实现:行业目录、插件卡(启用 Toggle/安装/可更新)、详情面板与数据契约 chips;安装的描述形式进入「添加形式」菜单。"
      />
    </FullLayout>
  );
}
