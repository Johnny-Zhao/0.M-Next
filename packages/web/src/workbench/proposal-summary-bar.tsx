import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import type { ViewClient, ViewObject } from "@m-next/views";

import { useWorkbenchContext } from "./workbench";

export type ProposalSummaryTone = "over" | "within" | "unknown";

export interface ProposalSummary {
  readonly name: string;
  readonly totalPower: number | null;
  readonly powerBudget: number | null;
  readonly tone: ProposalSummaryTone;
  readonly badge: string;
}

export function proposalSummaryLoadKey(
  workspaceId: string,
  refreshVersion: number,
): string {
  return `${workspaceId}:${refreshVersion}`;
}

export async function loadProposalSummary(
  viewClient: Pick<ViewClient, "objects">,
  workspaceId: string,
): Promise<ProposalSummary> {
  const page = await viewClient.objects(workspaceId, "proposal", 0, 1);
  return summarizeProposal(page.items[0]);
}

export function summarizeProposal(
  object: ViewObject | null | undefined,
): ProposalSummary {
  if (!object) return emptySummary();
  const totalPower = finiteNumber(object.derived?.total_power_fx);
  const powerBudget = finiteNumber(object.fields.power_budget_w);
  return {
    name: proposalName(object),
    totalPower,
    powerBudget,
    ...summaryTone(totalPower, powerBudget),
  };
}

export function formatPower(value: number | null): string {
  if (value === null) return "—";
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");
  return `${text}W`;
}

export function ProposalSummaryBar(): ReactElement {
  const { refreshVersion, viewClient, workspaceId } = useWorkbenchContext();
  // 查不到数据(尚未投影/查询失败)时用中性摘要「— / —」占位,不整条隐藏——进门瞬间也保持在场。
  const [summary, setSummary] = useState<ProposalSummary>(emptySummary);
  const loadKey = proposalSummaryLoadKey(workspaceId, refreshVersion);

  useEffect(() => {
    let disposed = false;
    void loadProposalSummary(viewClient, workspaceId)
      .then((next) => {
        if (!disposed) setSummary(next);
      })
      .catch(() => {
        if (!disposed) setSummary(emptySummary());
      });
    return () => {
      disposed = true;
    };
  }, [loadKey, viewClient, workspaceId]);

  return <ProposalSummaryBarView summary={summary} />;
}

export function ProposalSummaryBarView({
  summary,
}: {
  readonly summary: ProposalSummary;
}): ReactElement {
  return (
    <div aria-label="方案概览" style={barStyle}>
      <strong style={nameStyle}>{summary.name}</strong>
      <span aria-hidden="true" style={separatorStyle}>
        ·
      </span>
      <span style={powerStyle}>
        总功耗 {formatPower(summary.totalPower)} / 预算{" "}
        {formatPower(summary.powerBudget)}
      </span>
      <span style={badgeStyle(summary.tone)}>{summary.badge}</span>
    </div>
  );
}

function proposalName(object: ViewObject): string {
  const value = object.fields.name ?? object.fields.title ?? object.fields.code;
  // 文案红线:无 name/title/code 时用可读兜底,绝不把 objectId/UUID 当方案名显示。
  return typeof value === "string" && value.trim() ? value : "未命名方案";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summaryTone(
  totalPower: number | null,
  powerBudget: number | null,
): Pick<ProposalSummary, "badge" | "tone"> {
  if (totalPower === null || powerBudget === null) {
    return { badge: "—", tone: "unknown" };
  }
  return totalPower > powerBudget
    ? { badge: "超预算", tone: "over" }
    : { badge: "在预算内", tone: "within" };
}

function emptySummary(): ProposalSummary {
  return {
    name: "—",
    totalPower: null,
    powerBudget: null,
    badge: "—",
    tone: "unknown",
  };
}

const barStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--mn-panel)",
  borderBottom: "1px solid var(--mn-border)",
  color: "var(--mn-ink)",
  display: "flex",
  flex: "none",
  flexWrap: "wrap",
  gap: "0.45rem",
  minHeight: "34px",
  padding: "0.35rem 0.75rem",
};

const nameStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
};

const separatorStyle: CSSProperties = {
  color: "var(--mn-ink-3)",
};

const powerStyle: CSSProperties = {
  color: "var(--mn-ink-2)",
  fontSize: "12px",
};

const badgeBaseStyle: CSSProperties = {
  border: "1px solid transparent",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 700,
  padding: "0.1rem 0.5rem",
};

function badgeStyle(tone: ProposalSummaryTone): CSSProperties {
  if (tone === "over") {
    return {
      ...badgeBaseStyle,
      background: "var(--mn-bad-bg)",
      borderColor: "var(--mn-bad-bd)",
      color: "var(--mn-bad)",
    };
  }
  if (tone === "within") {
    return {
      ...badgeBaseStyle,
      background: "var(--mn-ok-bg)",
      borderColor: "var(--mn-ok-bd)",
      color: "var(--mn-ok)",
    };
  }
  return {
    ...badgeBaseStyle,
    background: "var(--mn-surface-2)",
    borderColor: "var(--mn-border-2)",
    color: "var(--mn-ink-3)",
  };
}
