import { describe, expect, it } from "vitest";

import {
  coverageRate,
  matrixStatus,
  statusLabel,
  statusTone,
} from "./verification-dashboard-panel";

describe("VerificationDashboardPanel helpers", () => {
  it("summarizes coverage rate", () => {
    expect(coverageRate({ total: 10, verified: 7 })).toBe(70);
    expect(coverageRate({ total: 0, verified: 0 })).toBe(0);
  });

  it("maps verification statuses to labels and tones", () => {
    expect(statusLabel("verified")).toBe("已验证");
    expect(statusLabel("unverified")).toBe("未覆盖");
    expect(statusLabel("failed")).toBe("失败");
    expect(statusTone("failed")).toBe("verification-status-failed");
  });

  it("colors matrix rows from gap state", () => {
    expect(
      matrixStatus("req-1", true, [
        {
          requirementId: "req-1",
          code: "R1",
          text: "Need proof",
          status: "failed",
          reason: "bad",
        },
      ]),
    ).toBe("failed");
    expect(matrixStatus("req-2", true, [])).toBe("verified");
    expect(matrixStatus("req-3", false, [])).toBe("unverified");
  });
});
