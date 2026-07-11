import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import type { ChangeSetState } from "../state/changeset-store";
import type { SessionState } from "../state/session-store";
import { WorkspaceStore } from "../state/workspace-store";
import { deriveHomeVm } from "./home-view-model";

describe("deriveHomeVm", () => {
  it("derives homepage counts from the stores", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed).getSnapshot();
    const changeSets: ChangeSetState = { changeSets: seed.changeSets };
    const session: SessionState = { currentMemberId: "wangyun" };

    const vm = deriveHomeVm(workspace, changeSets, session);

    expect(vm.expressions).toHaveLength(6);
    expect(vm.sources).toHaveLength(4);
    expect(vm.pendingCount).toBe(2);
    expect(vm.pendingAiCount).toBe(1);
    expect(vm.fieldRefCount).toBe(4);
    expect(
      vm.sources.find((source) => source.code === "product_specs")?.count,
    ).toBe(8);
    expect(vm.expressions[0]?.forms[0]).toBe("bi");
    expect(
      vm.expressions.find((expression) => expression.id === "exp-agreement")
        ?.activityAvatar,
    ).toBe("li");
  });

  it("uses the current session member for the greeting", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed).getSnapshot();
    const vm = deriveHomeVm(
      workspace,
      { changeSets: seed.changeSets },
      { currentMemberId: "chenmo" },
    );

    expect(vm.currentMemberName).toBe("陈默");
  });
});
