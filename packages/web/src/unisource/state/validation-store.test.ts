import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { ValidationStore } from "./validation-store";
import { WorkspaceStore } from "./workspace-store";

describe("ValidationStore", () => {
  it("runs on construction and reruns after workspace writes", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace);
    const before = store.getSnapshot().runAt;

    expect(store.errors().map((result) => result.ruleCode)).toEqual([
      "XSRC-001",
      "REF-002",
    ]);

    workspace.updateField("sales-offline-dealer", "cached_price", 1199, {
      actor: "wangyun",
    });

    expect(store.getSnapshot().runAt).not.toBe(before);
    expect(store.errors().map((result) => result.ruleCode)).toEqual([
      "REF-002",
    ]);
    store.dispose();
  });

  it("ignores a rule without reviving it on runAll", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace);

    store.ignore("XSRC-001", "wangyun");
    store.runAll();

    expect(store.shareDisabledReason()).toBe("存在校验错误,修复后可分享");
    expect(store.getSnapshot().ignored.has("XSRC-001")).toBe(true);
    expect(workspace.getReviewRecords()[0]?.note).toBe("忽略校验项 XSRC-001");
    store.dispose();
  });

  it("executes scripted fixes through workspace writes", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed());
    const store = new ValidationStore(workspace);

    expect(store.executeFix("XSRC-001", "wangyun").kind).toBe("fixed");
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.cached_price?.value,
    ).toBe(1199);
    expect(store.executeFix("TPL-003", "wangyun").kind).toBe("fixed");
    expect(workspace.getSlotBindings()[0]?.values.form_factor).toBe("ATX");
    store.dispose();
  });
});
