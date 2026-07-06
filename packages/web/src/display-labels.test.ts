import { describe, expect, it } from "vitest";

import {
  objectTypeLabel,
  safeVisibleText,
  statusLabel,
  templateLabel,
} from "./display-labels";

describe("display labels", () => {
  it("shows known templates and statuses as Chinese labels", () => {
    expect(templateLabel("technical_proposal")).toBe("技术方案");
    expect(objectTypeLabel("proposal")).toBe("方案");
    expect(statusLabel("ACTIVE")).toBe("正常");
  });

  it("hides internal codes and UUIDs from visible fallback text", () => {
    expect(safeVisibleText("technical_proposal", "技术方案")).toBe("技术方案");
    expect(
      safeVisibleText("a0000000-0000-4000-8000-000000000000", "对象"),
    ).toBe("对象");
  });
});
