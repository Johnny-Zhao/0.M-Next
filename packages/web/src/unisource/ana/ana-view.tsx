import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { UsButton, UsMonoTag, pushToast } from "../primitives";
import { useSessionSnapshot } from "../state/session-store";
import { workspaceStore, useWorkspaceSnapshot } from "../state/workspace-store";
import { buildAnaViewModel } from "./ana-view-model";
import { scheduleAnaReanalysis } from "./reanalyze";

export function AnaView({ viewId }: { readonly viewId: string }) {
  const workspace = useWorkspaceSnapshot();
  const session = useSessionSnapshot();
  const navigate = useNavigate();
  const [analyzing, setAnalyzing] = useState(false);
  const view = workspace.views.find(
    (candidate) => candidate.id === viewId && candidate.kind === "ana",
  );
  const report = workspace.anaReports.find(
    (candidate) => candidate.id === view?.config.reportId,
  );
  const vm = report ? buildAnaViewModel(workspace, report) : null;
  if (!view || !vm) return <p role="status">当前分析视图不可用。</p>;
  const exprId = view.exprId;
  const dashboardExprId = String(view.config.dashboardExprId ?? exprId);

  const revealKpis = (ids: readonly string[]) => {
    if (
      ids.every(
        (id) => workspace.kpis.find((kpi) => kpi.id === id)?.visible === true,
      )
    ) {
      pushToast({ title: "已在看板" });
      navigate(`/expr/${dashboardExprId}?form=bi`);
      return;
    }
    for (const id of ids) {
      if (workspace.kpis.find((kpi) => kpi.id === id)?.visible !== true) {
        workspaceStore.setKpiVisible(id, true, session.currentMemberId);
      }
    }
    pushToast({ title: "已钉回看板" });
    navigate(`/expr/${dashboardExprId}?form=bi`);
  };

  return (
    <section className="us-ana-shell">
      <header className="us-ana-hero">
        <UsMonoTag active>{vm.report.scopeLabel}</UsMonoTag>
        <h1>{vm.report.question}</h1>
        <span className="us-data">{vm.report.sourcesLabel}</span>
        {view.config.allowReanalysis === true ? (
          <UsButton
            disabled={analyzing}
            onClick={() => {
              scheduleAnaReanalysis({
                setAnalyzing,
                onDone: () =>
                  pushToast({ title: "分析结果已刷新", desc: "Mock 固定结果" }),
              });
            }}
            size="sm"
            variant="secondary"
          >
            {analyzing ? "分析中…" : "重新分析"}
          </UsButton>
        ) : null}
      </header>
      {analyzing ? (
        <div className="us-ana-skeleton" aria-label="分析中" />
      ) : (
        <>
          <section className="us-ana-card">
            <header>
              <span>{vm.report.factorTitle}</span>
              <strong>{vm.report.factorMetricLabel}</strong>
            </header>
            <div className="us-ana-factors">
              {vm.report.factors.length === 0 ? (
                <p role="status">暂无可展示数据</p>
              ) : null}
              {vm.report.factors.map((factor) => (
                <div className="us-ana-factor" key={factor.label}>
                  <span>{factor.label}</span>
                  <i
                    data-tone={factor.tone}
                    style={{ width: `${factor.widthPct}%` }}
                  />
                  <strong className="us-data">{factor.deltaText}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="us-ana-card">
            <header>
              <span>{vm.report.drillTitle}</span>
              <strong>{vm.report.drillTraceLabel}</strong>
            </header>
            {vm.report.drillRows.length === 0 ? (
              <p role="status">暂无可展示数据</p>
            ) : (
              <table className="us-ana-table">
                <thead>
                  <tr>
                    {vm.report.drillColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vm.report.drillRows.map((row, rowIndex) => (
                    <tr
                      key={String(
                        row[vm.report.drillColumns[0]?.key ?? ""] ?? rowIndex,
                      )}
                    >
                      {vm.report.drillColumns.map((column) => {
                        const value = row[column.key] ?? "—";
                        return (
                          <td className="us-data" key={column.key}>
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="us-ana-card us-ana-insights">
            <header>
              <span>洞察 INSIGHTS</span>
              <strong>可钉回看板</strong>
            </header>
            {vm.report.insights.map((insight) => (
              <article key={insight.title}>
                <h2>{insight.title}</h2>
                <p>
                  {insight.segments.map((segment, index) => (
                    <span
                      className={segment.mono ? "us-data" : undefined}
                      key={`${insight.title}-${index}`}
                    >
                      {segment.text}
                    </span>
                  ))}
                </p>
              </article>
            ))}
            <div className="us-ana-actions">
              {vm.actions.map((action) => (
                <UsButton
                  key={action.id}
                  onClick={() => revealKpis(action.kpiIds)}
                  size="sm"
                  variant={action.id === "pin" ? "primary" : "secondary"}
                >
                  {action.alreadyVisible ? "已在看板" : action.label}
                </UsButton>
              ))}
            </div>
          </section>
        </>
      )}
      <footer className="us-ana-foot">
        <UsMonoTag active>TRACE</UsMonoTag>
        分析建立在统一数据源之上,结论可溯源到记录级。
      </footer>
    </section>
  );
}
