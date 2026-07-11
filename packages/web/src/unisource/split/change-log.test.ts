import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { deriveChangeLogItems } from "./change-log";

describe("deriveChangeLogItems", () => {
  it("keeps recent product field events and formats old to new values", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    store.updateField("prod-s3", "price", 1099, { actor: "wangyun" });
    store.updateField("sales-offline-dealer", "month_sales", 2910, {
      actor: "chenmo",
    });

    const items = deriveChangeLogItems({
      events: store.getChangeEvents(),
      objects: store.getSnapshot().objects,
      members: store.getMembers(),
      objectTypeCode: "product_specs",
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.actorName).toBe("王芸");
    expect(items[0]?.summary).toContain("1199 → 1099");
  });
});
