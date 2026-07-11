import { afterEach, describe, expect, it } from "vitest";

import { resetToastsForTest } from "../primitives/toast/toast-store";
import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { SessionStore } from "../state/session-store";
import { WorkspaceStore } from "../state/workspace-store";
import { commitCellEdit, parseGridValue } from "./grid-actions";

describe("grid actions", () => {
  afterEach(() => {
    resetToastsForTest();
  });

  it("parses numeric fields before writing", () => {
    expect(parseGridValue("1099", "number")).toBe(1099);
    expect(parseGridValue("", "number")).toBeNull();
    expect(parseGridValue("S3", "text")).toBe("S3");
  });

  it("commits permitted edits and queues denied edits", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);

    const direct = commitCellEdit({
      objectTypeCode: "product_specs",
      objectId: "prod-s3",
      fieldCode: "price",
      dataType: "number",
      rawValue: "1099",
      session,
      workspace,
    });
    session.switchMember("chenmo");
    const queued = commitCellEdit({
      objectTypeCode: "product_specs",
      objectId: "prod-s3",
      fieldCode: "price",
      dataType: "number",
      rawValue: "999",
      session,
      workspace,
    });

    expect(direct.kind).toBe("written");
    expect(workspace.getObject("prod-s3")?.fields.price?.value).toBe(1099);
    expect(queued.kind).toBe("queued");
    expect(changes.getPending()[0]?.actor).toBe("chenmo");
  });
});
