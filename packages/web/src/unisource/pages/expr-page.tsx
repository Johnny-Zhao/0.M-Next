import { useParams, useSearchParams } from "react-router-dom";

import { UsMonoTag } from "../primitives";
import { parseFormParam } from "../routes-paths";
import { FormRow, nextFormSearch } from "../shell/form-row";
import { UsInspector } from "../shell/inspector";
import { WorkspaceLayout } from "../shell/layouts";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { PageSkeleton } from "./page-skeleton";

const FORM_LABEL: Record<string, string> = {
  grid: "表格",
  doc: "文档",
  canvas: "视图",
  matrix: "矩阵",
  bi: "BI 看板",
  ana: "分析",
};

/**
 * 表达页宿主:/expr/:exprId?form=…(doc/split/canvas/matrix/bi/ana 的挂载点)。
 * P0:读取 form 参数展示占位;form=canvas 时挂 Inspector 容器(属性/样式/版本)。
 */
export function ExprPage() {
  const { exprId } = useParams<{ exprId: string }>();
  const [search, setSearch] = useSearchParams();
  const snapshot = useWorkspaceSnapshot();
  const expr = snapshot.expressions.find(
    (candidate) => candidate.id === exprId,
  );
  const form = parseFormParam(search, expr?.defaultForm ?? "doc");
  const forms = Array.from(
    new Set(
      expr?.viewIds
        .map(
          (viewId) => snapshot.views.find((view) => view.id === viewId)?.kind,
        )
        .filter((value): value is NonNullable<typeof value> =>
          Boolean(value),
        ) ?? ["doc"],
    ),
  );
  const people = snapshot.members.slice(0, 2).map((member) => ({
    member: member.avatar,
    label: member.name.slice(0, 1),
    title: member.name,
  }));

  const inspector =
    form === "canvas" ? (
      <UsInspector
        aside={<span className="us-data">已选 0</span>}
        tabs={[
          {
            key: "props",
            label: "属性",
            content: (
              <PageSkeleton
                kicker="INSPECTOR"
                title="属性"
                desc="P2:绑定记录、卡片显示字段、移除出视图 / 删除数据源记录。"
              />
            ),
          },
          {
            key: "style",
            label: "样式",
            content: (
              <PageSkeleton
                kicker="INSPECTOR"
                title="样式"
                desc="P2:字体/字号/颜色/填充/圆角/显示隐藏;多选时「混合」占位。"
              />
            ),
          },
          {
            key: "versions",
            label: "版本",
            content: (
              <PageSkeleton
                kicker="INSPECTOR"
                title="版本"
                desc="P2:数据轨(琥珀)与视图轨(蓝灰)分色版本流,逐条恢复。"
              />
            ),
          },
        ]}
      />
    ) : undefined;

  return (
    <WorkspaceLayout
      chrome={{
        breadcrumb: [
          { label: "表达" },
          { label: expr?.name ?? exprId ?? "未知表达" },
        ],
        sync: { state: "ok", label: expr?.lastActivity ?? "已同步" },
        people,
      }}
      inspector={inspector}
      subHeader={
        <FormRow
          activeForm={form}
          forms={forms}
          onFormChange={(next) =>
            setSearch(nextFormSearch(search.toString(), next))
          }
        />
      }
    >
      <PageSkeleton
        kicker={`EXPR · form=${form}`}
        title={
          <>
            {expr?.name ?? "未知表达"}{" "}
            <UsMonoTag active>{FORM_LABEL[form] ?? form}</UsMonoTag>
          </>
        }
        desc="P1/P2 实现:HOW 形式行与各描述形式主区(文档/分屏/画布/矩阵/BI/分析);URL form= 与界面状态双向同步(本页已生效)。"
      />
    </WorkspaceLayout>
  );
}
