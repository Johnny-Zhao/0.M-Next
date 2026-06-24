import { describe, expect, it } from "vitest";

import { severityLabel, severityTone } from "./validate-panel";

describe("validate-panel", () => {
  it("maps severities to tones (default info)", () => {
    expect(severityTone("BLOCK")).toBe("block");
    expect(severityTone("warn")).toBe("warn");
    expect(severityTone("INFO")).toBe("info");
    expect(severityTone("whatever")).toBe("info");
  });

  it("labels severities in Chinese, passing through unknowns", () => {
    expect(severityLabel("BLOCK")).toBe("阻断");
    expect(severityLabel("WARN")).toBe("告警");
    expect(severityLabel("INFO")).toBe("提示");
    expect(severityLabel("X")).toBe("X");
  });
});
