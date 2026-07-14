import { describe, expect, it } from "vitest";

import { buildGridViewModel } from "../grid/grid-view-model";
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
    expect(session.canDragCards("chenmo")).toBe(true);
    expect(session.canDragCards("zhouran")).toBe(false);
    expect(session.canDragCards("ai")).toBe(false);
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

  it("defers permission decisions to the backend in kernel mode", () => {
    const seed = {
      ...cloneDemoSeed(),
      permissions: {
        wangyun: {},
        lixiao: {},
        chenmo: {},
        zhouran: {},
        ai: {},
      },
    };
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);
    session.setPermissionSource("kernel");
    const beforePending = changes.getPending().length;

    expect(session.can("zhouran", "product_specs", "read")).toBe(true);
    expect(session.can("zhouran", "product_specs", "editData")).toBe(true);
    expect(session.can("zhouran", "product_specs", "admin")).toBe(false);
    expect(session.canDragCards("zhouran")).toBe(true);
    const objectType = seed.objectTypes.find(
      (type) => type.code === "product_specs",
    )!;
    const grid = buildGridViewModel({
      objectType,
      objects: seed.objects.filter(
        (object) => object.objectTypeCode === objectType.code,
      ),
      maskValues: !session.can("zhouran", objectType.code, "read"),
    });
    expect(grid.rows[0]?.cells.every((cell) => !cell.masked)).toBe(true);
    expect(
      session.requestWrite({
        resourceCode: "product_specs",
        objectId: "prod-s3",
        fieldCode: "price",
        value: 1099,
      }).queued,
    ).toBe(false);
    expect(changes.getPending()).toHaveLength(beforePending);
  });
});
