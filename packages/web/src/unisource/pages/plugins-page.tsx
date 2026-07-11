import { PluginsView } from "../plugins/plugins-view";
import { FullLayout } from "../shell/layouts";
import { useWorkspaceSnapshot } from "../state/workspace-store";

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
      }}
    >
      <PluginsView />
    </FullLayout>
  );
}
