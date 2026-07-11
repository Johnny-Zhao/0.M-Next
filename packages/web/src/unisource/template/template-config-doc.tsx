import { UsMonoTag } from "../primitives";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { buildTemplateViewModel } from "./template-view-model";

export function TemplateConfigDoc({ exprId }: { exprId: string }) {
  const workspace = useWorkspaceSnapshot();
  const docView = workspace.views.find(
    (candidate) => candidate.exprId === exprId && candidate.kind === "doc",
  );
  const sourceExprId = String(docView?.config.sourceExprId ?? "");
  const sourceView = workspace.views.find(
    (candidate) =>
      candidate.exprId === sourceExprId && candidate.kind === "canvas",
  );
  const vm = sourceView
    ? buildTemplateViewModel(workspace, sourceView, null)
    : null;
  const rows = vm?.slots.filter((slot) => slot.objectId !== null) ?? [];
  const total = rows.reduce((sum, slot) => {
    const price = slot.fields.find((field) => field.code === "price")?.value;
    return sum + (typeof price === "number" ? price : 0);
  }, 0);

  return (
    <section className="us-doc-layout">
      <main className="us-doc-main">
        <article className="us-doc-paper us-config-doc">
          <div className="us-doc-meta">
            <span>BUILD-Z890-001</span>
            <span>模板:{vm?.templateName ?? "装机方案 V1"}</span>
            <span>来源:装机方案·Z890 高配</span>
          </div>
          <p className="us-doc-author">王芸 · 供应链 | 字段来自硬件产品库</p>
          <h1 className="us-doc-title">装机配置单·Z890</h1>
          <p>
            本配置单由模板槽位实时生成。任一硬件产品库字段更新后，价格与合计同步刷新。
          </p>
          <section className="us-doc-tableblock">
            <header>
              <strong>配置明细 · 来自槽位绑定</strong>
              <UsMonoTag tone="primary">LIVE</UsMonoTag>
            </header>
            <table>
              <tbody>
                {rows.map((slot) => {
                  const price = slot.fields.find(
                    (field) => field.code === "price",
                  )?.text;
                  return (
                    <tr key={slot.slotId}>
                      <th>{slot.label}</th>
                      <td>{slot.objectName}</td>
                      <td className="us-data">{price ?? "—"}</td>
                    </tr>
                  );
                })}
                <tr className="us-config-doc__total">
                  <th>合计</th>
                  <td />
                  <td className="us-data">¥{total.toLocaleString("zh-CN")}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </article>
      </main>
    </section>
  );
}
