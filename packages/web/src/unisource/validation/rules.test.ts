import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { deriveShareBlocked, runValidationRules } from "./rules";

describe("validation rules", () => {
  it("derives the scripted 2 errors, 1 warning and 8 passed rules", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const results = runValidationRules(store.getSnapshot());

    expect(results).toHaveLength(11);
    expect(results.filter((result) => result.level === "error")).toHaveLength(
      2,
    );
    expect(results.filter((result) => result.level === "warning")).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.level === "passed")).toHaveLength(
      8,
    );
    expect(results.map((result) => result.ruleCode)).toContain("XSRC-001");
    expect(results.map((result) => result.ruleCode)).toContain("REF-002");
    expect(results.map((result) => result.ruleCode)).toContain("TPL-003");
  });

  it("turns fixable rules to passed after data writes", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    store.updateField("sales-offline-dealer", "cached_price", 1199, {
      actor: "wangyun",
    });
    store.bindSlot(
      { bindingId: "binding-b860-mainboard" },
      "hw-mb-prime-z890-p",
      { actor: "wangyun" },
    );
    store.rebindFieldRef(
      "ref-weekly-presale-gift-dangling",
      "launch_date",
      "wangyun",
    );

    const byCode = new Map(
      runValidationRules(store.getSnapshot()).map((result) => [
        result.ruleCode,
        result.level,
      ]),
    );

    expect(byCode.get("XSRC-001")).toBe("passed");
    expect(byCode.get("TPL-003")).toBe("passed");
    expect(byCode.get("REF-002")).toBe("passed");
    expect(
      deriveShareBlocked(runValidationRules(store.getSnapshot()), new Set()),
    ).toBeNull();
  });
});
