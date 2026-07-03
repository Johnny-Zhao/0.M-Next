import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ViewObject } from "@m-next/views";

import {
  ProposalSummaryBarView,
  formatPower,
  loadProposalSummary,
  proposalSummaryLoadKey,
  summarizeProposal,
} from "./proposal-summary-bar";

describe("proposal summary bar", () => {
  it("summarizes an over-budget proposal", () => {
    const summary = summarizeProposal(
      proposal({ power_budget_w: 800 }, { total_power_fx: 820 }),
    );

    expect(summary).toMatchObject({
      name: "技术方案 Demo",
      totalPower: 820,
      powerBudget: 800,
      tone: "over",
      badge: "超预算",
    });
    const html = renderToStaticMarkup(
      <ProposalSummaryBarView summary={summary} />,
    );
    expect(html).toContain("总功耗 820W / 预算");
    expect(html).toContain("超预算");
  });

  it("summarizes an in-budget proposal", () => {
    const summary = summarizeProposal(
      proposal({ power_budget_w: 800 }, { total_power_fx: 790 }),
    );

    expect(summary).toMatchObject({
      totalPower: 790,
      powerBudget: 800,
      tone: "within",
      badge: "在预算内",
    });
    const html = renderToStaticMarkup(
      <ProposalSummaryBarView summary={summary} />,
    );
    expect(html).toContain("790W");
    expect(html).toContain("在预算内");
  });

  it("uses the neutral branch when proposal data is missing", () => {
    const summary = summarizeProposal(undefined);

    expect(summary).toMatchObject({
      name: "—",
      totalPower: null,
      powerBudget: null,
      tone: "unknown",
      badge: "—",
    });
    const html = renderToStaticMarkup(
      <ProposalSummaryBarView summary={summary} />,
    );
    expect(html).toContain("总功耗 — / 预算");
    expect(html).toContain(">—</span>");
  });

  it("loads the first proposal and keys reloads by refresh version", async () => {
    const objects = vi.fn().mockResolvedValue({
      items: [proposal({ power_budget_w: 800 }, { total_power_fx: 820 })],
      page: 0,
      pageSize: 1,
      total: 1,
    });

    await expect(
      loadProposalSummary({ objects }, "workspace-1"),
    ).resolves.toMatchObject({
      badge: "超预算",
      totalPower: 820,
    });

    expect(objects).toHaveBeenCalledWith("workspace-1", "proposal", 0, 1);
    expect(proposalSummaryLoadKey("workspace-1", 1)).not.toBe(
      proposalSummaryLoadKey("workspace-1", 2),
    );
  });

  it("formats compact numeric power values", () => {
    expect(formatPower(260)).toBe("260W");
    expect(formatPower(12.5)).toBe("12.5W");
    expect(formatPower(null)).toBe("—");
  });
});

function proposal(
  fields: Readonly<Record<string, unknown>>,
  derived: Readonly<Record<string, unknown>>,
): ViewObject {
  return {
    objectId: "proposal-1",
    objectType: "proposal",
    status: "ACTIVE",
    version: 1,
    fields: { name: "技术方案 Demo", ...fields },
    derived,
    updatedAt: "2026-07-03T00:00:00Z",
    source: "manual",
    ruleStatus: "BLOCK",
  };
}
