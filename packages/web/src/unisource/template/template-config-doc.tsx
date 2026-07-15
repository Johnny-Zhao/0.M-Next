import { UsMonoTag } from "../primitives";
import { RefChip } from "../doc/ref-chip";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { buildTemplateViewModel } from "./template-view-model";

export function TemplateConfigDoc({ viewId }: { viewId: string }) {
  const workspace = useWorkspaceSnapshot();
  const docView = workspace.views.find(
    (candidate) => candidate.id === viewId && candidate.kind === "doc",
  );
  const sourceExprId = String(docView?.config.sourceExprId ?? "");
  const sourceView = workspace.views.find(
    (candidate) =>
      candidate.exprId === sourceExprId && candidate.kind === "canvas",
  );
  const sourceExpr = workspace.expressions.find(
    (candidate) => candidate.id === sourceExprId,
  );
  const title = String(docView?.config.title ?? sourceExpr?.name ?? "配置文档");
  const nameField = String(docView?.config.nameFieldCode ?? "name");
  const valueField = String(docView?.config.valueFieldCode ?? "");
  const vm = sourceView
    ? buildTemplateViewModel(workspace, sourceView, null)
    : null;
  if (!docView || !sourceView || !vm) {
    return <p role="status">当前配置文档不可用。</p>;
  }
  const rows = vm?.slots.filter((slot) => slot.objectId !== null) ?? [];
  const total = rows.reduce((sum, slot) => {
    const value = slot.fields.find((field) => field.code === valueField)?.value;
    return sum + (typeof value === "number" ? value : 0);
  }, 0);

  return (
    <section className="us-doc-layout">
      <main className="us-doc-main">
        <article className="us-doc-paper us-config-doc">
          <div className="us-doc-meta">
            <span>{String(docView?.config.documentNo ?? "LIVE-DOC")}</span>
            <span>模板:{vm?.templateName ?? "未指定模板"}</span>
            <span>来源:{sourceExpr?.name ?? sourceExprId}</span>
          </div>
          <p className="us-doc-author">
            {String(docView?.config.authorLine ?? "字段来自当前工作空间")}
          </p>
          <h1 className="us-doc-title">{title}</h1>
          <p>{String(docView?.config.intro ?? "内容由当前表达配置生成。")}</p>
          <section className="us-doc-tableblock">
            <header>
              <strong>
                {String(docView?.config.tableTitle ?? "明细 · 来自绑定")}
              </strong>
              <UsMonoTag tone="primary">LIVE</UsMonoTag>
            </header>
            <table>
              <tbody>
                {rows.map((slot) => {
                  const displayValue = slot.fields.find(
                    (field) => field.code === valueField,
                  )?.text;
                  return (
                    <tr key={slot.slotId}>
                      <th>{slot.label}</th>
                      <td>
                        <span className="us-config-doc__refcells">
                          <RefChip
                            objectId={slot.objectId ?? undefined}
                            fieldCode={nameField}
                            label={slot.objectName ?? slot.label}
                          />
                        </span>
                      </td>
                      <td>
                        <span className="us-config-doc__refcells">
                          {valueField ? (
                            <RefChip
                              objectId={slot.objectId ?? undefined}
                              fieldCode={valueField}
                              label={displayValue ?? "字段值"}
                            />
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="us-config-doc__total">
                  <th>{String(docView?.config.totalLabel ?? "合计")}</th>
                  <td />
                  <td className="us-data">
                    {String(docView?.config.totalPrefix ?? "")}
                    {total.toLocaleString("zh-CN")}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </article>
      </main>
    </section>
  );
}
