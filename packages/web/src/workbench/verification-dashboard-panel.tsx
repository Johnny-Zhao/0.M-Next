import { useEffect, useMemo, useState, type ReactElement } from "react";

import type {
  LineageView,
  MatrixResult,
  VerificationCoverage,
  VerificationCoverageStatus,
  VerificationGap,
} from "@m-next/views";

import { useWorkbenchContext } from "./workbench";

const pageSize = 30;

export function coverageRate(
  coverage: Pick<VerificationCoverage, "total" | "verified">,
): number {
  return coverage.total <= 0
    ? 0
    : Math.round((coverage.verified / coverage.total) * 100);
}

export function statusLabel(status: VerificationCoverageStatus): string {
  if (status === "failed") return "失败";
  if (status === "unverified") return "未覆盖";
  return "已验证";
}

export function statusTone(status: VerificationCoverageStatus): string {
  if (status === "failed") return "verification-status-failed";
  if (status === "unverified") return "verification-status-unverified";
  return "verification-status-verified";
}

export function matrixStatus(
  rowId: string,
  hasCell: boolean,
  gaps: readonly VerificationGap[],
): VerificationCoverageStatus {
  const gap = gaps.find((item) => item.requirementId === rowId);
  if (gap) return gap.status;
  return hasCell ? "verified" : "unverified";
}

export function VerificationDashboardPanel(): ReactElement {
  const { refreshVersion, reportError, selection, viewClient, workspaceId } =
    useWorkbenchContext();
  const [coverage, setCoverage] = useState<VerificationCoverage | null>(null);
  const [matrix, setMatrix] = useState<MatrixResult | null>(null);
  const [lineage, setLineage] = useState<LineageView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    async function load(): Promise<void> {
      setLoading(true);
      try {
        const [coverageResult, matrixResult] = await Promise.all([
          viewClient.verificationCoverage(workspaceId, 0, pageSize),
          viewClient.matrix(
            workspaceId,
            "requirement",
            "test_case",
            "verified_by",
            0,
            20,
            0,
            20,
          ),
        ]);
        if (disposed) return;
        setCoverage(coverageResult);
        setMatrix(matrixResult);
      } catch (error) {
        if (!disposed) {
          setCoverage(null);
          setMatrix(null);
          reportError(
            error instanceof Error ? error.message : "验证仪表加载失败",
          );
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [refreshVersion, reportError, viewClient, workspaceId]);

  const cellsByPair = useMemo(() => {
    const cells = new Set<string>();
    matrix?.cells.forEach((cell) => cells.add(`${cell.rowId}:${cell.colId}`));
    return cells;
  }, [matrix]);

  async function selectRequirement(requirementId: string): Promise<void> {
    selection.select({ entityType: "object", entityId: requirementId });
    try {
      setLineage(
        await viewClient.lineage(
          workspaceId,
          requirementId,
          "verify_status_fx",
        ),
      );
    } catch (error) {
      setLineage(null);
      reportError(error instanceof Error ? error.message : "验证追溯读取失败");
    }
  }

  const rate = coverage ? coverageRate(coverage) : 0;
  const gaps = coverage?.gaps.items ?? [];

  return (
    <section aria-label="验证仪表" className="verification-dashboard">
      <header className="verification-dashboard-header">
        <div>
          <h2>验证仪表</h2>
          <p>需求覆盖、失败与未覆盖缺口</p>
        </div>
        <strong>{loading ? "..." : `${rate}%`}</strong>
      </header>

      {loading ? (
        <div className="panel-skeleton" aria-label="验证仪表加载中" />
      ) : null}

      {!loading && (!coverage || coverage.total === 0) ? (
        <p className="view-empty-state">当前工作空间暂无 MBSE 验证数据。</p>
      ) : null}

      {coverage ? (
        <>
          <div className="verification-summary" aria-label="验证覆盖汇总">
            <SummaryCard
              label="已验证"
              status="verified"
              value={coverage.verified}
            />
            <SummaryCard
              label="未覆盖"
              status="unverified"
              value={coverage.unverified}
            />
            <SummaryCard label="失败" status="failed" value={coverage.failed} />
            <div className="verification-rate-bar">
              <span style={{ width: `${rate}%` }} />
            </div>
          </div>

          <div className="verification-layout">
            <section className="verification-matrix" aria-label="验证覆盖矩阵">
              <h3>需求 × 测试用例</h3>
              {matrix && matrix.rows.length > 0 && matrix.cols.length > 0 ? (
                <div className="verification-matrix-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>需求</th>
                        {matrix.cols.map((col) => (
                          <th key={col.objectId}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.rows.map((row) => (
                        <tr key={row.objectId}>
                          <th>
                            <button
                              onClick={() =>
                                void selectRequirement(row.objectId)
                              }
                              type="button"
                            >
                              {row.label}
                            </button>
                          </th>
                          {matrix.cols.map((col) => {
                            const hasCell = cellsByPair.has(
                              `${row.objectId}:${col.objectId}`,
                            );
                            const status = matrixStatus(
                              row.objectId,
                              hasCell,
                              gaps,
                            );
                            return (
                              <td
                                className={statusTone(status)}
                                key={col.objectId}
                              >
                                <button
                                  onClick={() =>
                                    void selectRequirement(row.objectId)
                                  }
                                  type="button"
                                >
                                  {hasCell ? statusLabel(status) : "缺"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="view-empty-state">
                  暂无 requirement × test_case 覆盖矩阵。
                </p>
              )}
            </section>

            <section className="verification-gaps" aria-label="验证缺口列表">
              <h3>缺口</h3>
              {gaps.length === 0 ? (
                <p className="view-empty-state">没有未覆盖或失败需求。</p>
              ) : (
                <ul>
                  {gaps.map((gap) => (
                    <li
                      className={statusTone(gap.status)}
                      key={gap.requirementId}
                    >
                      <button
                        onClick={() =>
                          void selectRequirement(gap.requirementId)
                        }
                        type="button"
                      >
                        <strong>{gap.code}</strong>
                        <span>{statusLabel(gap.status)}</span>
                        <small>{gap.reason || gap.text}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {lineage ? (
                <div className="verification-lineage">
                  <strong>追溯链</strong>
                  <span>
                    {lineage.algorithm.kind}:{lineage.algorithm.ref}
                  </span>
                  <small>
                    upstream {lineage.upstream.length} / downstream{" "}
                    {lineage.downstream.length}
                  </small>
                </div>
              ) : null}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SummaryCard(props: {
  readonly label: string;
  readonly status: VerificationCoverageStatus;
  readonly value: number;
}): ReactElement {
  return (
    <div className={`verification-summary-card ${statusTone(props.status)}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
