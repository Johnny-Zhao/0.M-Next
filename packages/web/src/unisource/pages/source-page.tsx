import { useParams, useSearchParams } from "react-router-dom";

import { parseFormParam } from "../routes-paths";
import { FormRow, nextFormSearch } from "../shell/form-row";
import { WorkspaceLayout } from "../shell/layouts";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { PageSkeleton } from "./page-skeleton";

export function SourcePage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const [search, setSearch] = useSearchParams();
  const snapshot = useWorkspaceSnapshot();
  const objectType = snapshot.objectTypes.find(
    (type) => type.code === sourceId,
  );
  const objects = snapshot.objects.filter(
    (object) => object.objectTypeCode === objectType?.code,
  );
  const people = snapshot.members.slice(0, 3).map((member) => ({
    member: member.avatar,
    label: member.name.slice(0, 1),
    title: member.name,
  }));
  const form = parseFormParam(search, "grid");
  return (
    <WorkspaceLayout
      sidebarTab="data"
      chrome={{
        breadcrumb: [
          { label: "统一数据源" },
          { label: objectType?.name ?? sourceId ?? "未知库" },
        ],
        sync: {
          state: "ok",
          label: `${objects.length} 条记录 · ${snapshot.fieldRefs.length} 处引用`,
        },
        people,
      }}
      subHeader={
        <FormRow
          activeForm={form}
          forms={["grid"]}
          onFormChange={(next) =>
            setSearch(nextFormSearch(search.toString(), next))
          }
        >
          同一份数据,换任意形式描述
        </FormRow>
      }
    >
      <PageSkeleton
        kicker="GRID · v3"
        title={`表格视图 · ${objectType?.name ?? "未知库"}`}
        desc="P1 实现:HOW 形式行、工具栏(记录集/筛选/排序/分组)、DataGrid(选中青绿左沿/编辑琥珀描边/字段类型表头)与底部统计条。"
      />
    </WorkspaceLayout>
  );
}
