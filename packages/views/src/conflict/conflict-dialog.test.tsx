import { describe, expect, it } from "vitest";

import { ConflictDialog } from "./conflict-dialog";

describe("ConflictDialog", () => {
  it("shows conflicting fields without force overwrite", () => {
    const dialog = ConflictDialog({
      fields: [
        {
          fieldDefCode: "power_w",
          yourValue: 8,
          currentValue: 9,
          changedBy: "reviewer",
          changedAt: "now",
        },
      ],
      onConfirm: () => undefined,
      onClose: () => undefined,
    });
    const serialized = JSON.stringify(dialog);

    expect(serialized).toContain("功率(W)");
    expect(serialized).toContain("采用我的值");
    expect(serialized).not.toContain("强制覆盖");
  });
});
