import { describe, expect, it } from "vitest";

import { kernelValidationStatusNotice } from "./kernel-validation-panel";

describe("kernelValidationStatusNotice", () => {
  it("marks stale results as being revalidated or potentially outdated", () => {
    expect(
      kernelValidationStatusNotice({
        kernelRunning: true,
        kernelLoading: false,
        kernelStale: true,
        kernelStatus: "running",
      }),
    ).toBe("数据已变更,正在重新校验…");
    expect(
      kernelValidationStatusNotice({
        kernelRunning: false,
        kernelLoading: false,
        kernelStale: true,
        kernelStatus: "ready",
      }),
    ).toBe("数据已变更,校验结果可能已过期");
  });

  it("does not present a non-stale running check as a completed result", () => {
    expect(
      kernelValidationStatusNotice({
        kernelRunning: true,
        kernelLoading: false,
        kernelStale: false,
        kernelStatus: "running",
      }),
    ).toBe("正在校验…");
  });

  it("distinguishes loading and failed persisted-result reads", () => {
    expect(
      kernelValidationStatusNotice({
        kernelRunning: true,
        kernelLoading: true,
        kernelStale: false,
        kernelStatus: "running",
      }),
    ).toBe("正在加载校验结果…");
    expect(
      kernelValidationStatusNotice({
        kernelRunning: false,
        kernelLoading: false,
        kernelStale: false,
        kernelStatus: "error",
      }),
    ).toBe("校验结果加载失败");
  });
});
