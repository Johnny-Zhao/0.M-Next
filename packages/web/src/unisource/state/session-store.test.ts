import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "./changeset-store";
import { SessionStore } from "./session-store";
import { WorkspaceStore } from "./workspace-store";

describe("SessionStore", () => {
  it("evaluates the demo permission matrix", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);

    expect(session.can("wangyun", "product_specs", "admin")).toBe(true);
    expect(session.can("wangyun", "exp-spec-doc", "editView")).toBe(true);
    expect(session.can("lixiao", "product_specs", "editData")).toBe(true);
    expect(session.can("lixiao", "channel_sales", "editData")).toBe(false);
    expect(session.can("chenmo", "product_specs", "editData")).toBe(false);
    expect(session.can("chenmo", "channel_sales", "editData")).toBe(true);
    expect(session.can("zhouran", "channel_sales", "read")).toBe(false);
  });

  it("writes directly when permitted and queues manual approval when denied", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);

    session.switchMember("chenmo");
    const allowed = session.requestWrite({
      resourceCode: "channel_sales",
      objectId: "sales-offline-dealer",
      fieldCode: "month_sales",
      value: 2910,
    });
    const beforeDeniedEvents = workspace.getChangeEvents().length;
    const denied = session.requestWrite({
      resourceCode: "product_specs",
      objectId: "prod-s3",
      fieldCode: "price",
      value: 1099,
    });

    expect(allowed.queued).toBe(false);
    expect(
      workspace.getObject("sales-offline-dealer")?.fields.month_sales?.value,
    ).toBe(2910);
    expect(denied.queued).toBe(true);
    expect(workspace.getChangeEvents()).toHaveLength(beforeDeniedEvents);
    expect(changes.getPending()[0]?.source).toBe("manual");
    expect(changes.getPending()[0]?.actor).toBe("chenmo");
  });
});
