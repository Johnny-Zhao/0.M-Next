import { describe, expect, it } from "vitest";

import { kernelValidationStatusNotice } from "./kernel-validation-panel";

describe("kernelValidationStatusNotice", () => {
  it("marks stale results as being revalidated or potentially outdated", () => {
    expect(
      kernelValidationStatusNotice({ kernelRunning: true, kernelStale: true }),
    ).toBe("数据已变更,正在重新校验…");
    expect(
      kernelValidationStatusNotice({ kernelRunning: false, kernelStale: true }),
    ).toBe("数据已变更,校验结果可能已过期");
  });

  it("does not present a non-stale running check as a completed result", () => {
    expect(
      kernelValidationStatusNotice({ kernelRunning: true, kernelStale: false }),
    ).toBe("正在校验…");
  });
});
