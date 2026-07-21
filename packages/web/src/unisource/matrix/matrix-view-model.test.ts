import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "../state/changeset-store";
import { SessionStore } from "../state/session-store";
import { WorkspaceStore } from "../state/workspace-store";
import { moveMatrixCardColumn } from "./matrix-actions";
import { buildMatrixViewModel } from "./matrix-view-model";

describe("matrix view model", () => {
  it("derives lifecycle columns, owner rows, live cards and dimmed EOL column", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-inventory-matrix",
    )!;

    const vm = buildMatrixViewModel(workspace, view);

    expect(vm.columns.map((column) => [column.label, column.count])).toEqual([
      ["研发中", 1],
      ["预售", 2],
      ["在售", 4],
      ["停产", 1],
    ]);
    expect(vm.rows.map((row) => [row.label, row.count])).toEqual([
      ["王芸", 3],
      ["李晓", 2],
      ["陈默", 2],
      ["周然", 1],
    ]);
    expect(
      vm.cards.find((card) => card.objectId === "prod-s3")?.fields,
    ).toEqual([
      { code: "price", label: "权威售价", text: "¥1,199" },
      { code: "docRefs", label: "关联文档", text: "3" },
    ]);
    expect(vm.cards.find((card) => card.objectId === "prod-p1")?.dim).toBe(
      true,
    );
  });

  it("supports another row and column field pair from config", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-inventory-matrix",
    )!;

    const vm = buildMatrixViewModel(workspace, {
      ...view,
      config: {
        ...view.config,
        rowField: "lifecycle",
        colField: "owner",
      },
    });

    expect(vm.rowField.code).toBe("lifecycle");
    expect(vm.colField.code).toBe("owner");
    expect(vm.columns.map((column) => column.label)).toContain("王芸");
  });

  it("returns a diagnosable state for missing configured fields", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-inventory-matrix",
    )!;

    const vm = buildMatrixViewModel(workspace, {
      ...view,
      config: { ...view.config, rowField: "missing_field" },
    });

    expect(vm.state).toBe("unavailable");
    expect(vm.message).toBe("矩阵配置引用的字段不存在");
    expect(vm.cards).toEqual([]);
  });

  it("does not present terminal source objects as active comparison cards", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore({
      ...seed,
      objects: seed.objects.map((candidate) =>
        candidate.id === "prod-s3"
          ? { ...candidate, status: "archived" }
          : candidate,
      ),
    }).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-inventory-matrix",
    )!;
    const vm = buildMatrixViewModel(workspace, view);
    expect(vm.cards.some((card) => card.objectId === "prod-s3")).toBe(false);
  });

  it("writes direct moves, queues denied writes and treats same-column drops as noop", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);

    const noop = moveMatrixCardColumn({
      session,
      resourceCode: "product_specs",
      objectId: "prod-d2",
      fieldCode: "lifecycle",
      fromValue: "在售",
      toValue: "在售",
    });

    const direct = moveMatrixCardColumn({
      session,
      resourceCode: "product_specs",
      objectId: "prod-d2",
      fieldCode: "lifecycle",
      fromValue: "在售",
      toValue: "停产",
    });
    workspace.undo(
      direct.kind === "written" && !direct.queued ? direct.eventId : "",
    );

    session.switchMember("chenmo");
    const beforeDeniedEvents = workspace.getChangeEvents().length;
    const queued = moveMatrixCardColumn({
      session,
      resourceCode: "product_specs",
      objectId: "prod-s3",
      fieldCode: "lifecycle",
      fromValue: "预售",
      toValue: "在售",
    });

    expect(noop.kind).toBe("noop");
    expect(direct.kind).toBe("written");
    expect(workspace.getObject("prod-d2")?.fields.lifecycle?.value).toBe(
      "在售",
    );
    expect(queued.kind).toBe("written");
    expect(queued.kind === "written" && queued.queued).toBe(true);
    expect(workspace.getChangeEvents()).toHaveLength(beforeDeniedEvents);
    expect(changes.getPending()[0]?.actor).toBe("chenmo");
    expect(session.canDragCards("zhouran")).toBe(false);
  });
});
