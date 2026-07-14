import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  buildDocViewModel,
  countDocText,
  filterFieldOptions,
  popoverReducer,
} from "./doc-view-model";

describe("doc-view-model", () => {
  it("resolves refs, counts document fields and derives danger HOW text", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const snapshot = store.getSnapshot();
    const doc = snapshot.docModels.find(
      (item) => item.exprId === "exp-spec-doc",
    )!;

    const vm = buildDocViewModel(snapshot, doc);

    expect(vm.refCount).toBe(11);
    expect(
      vm.refs.find((ref) => ref.state === "lowConfidence")?.confidenceLabel,
    ).toBe("74%");
    expect(vm.danglingCount).toBe(1);
    expect(vm.howState).toBe("danger");
    expect(vm.howLabel).toBe("1 处引用悬空");
    expect(vm.fields.find((field) => field.fieldCode === "price")?.count).toBe(
      1,
    );
  });

  it("derives just-synced HOW text after a data edit", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    store.rebindFieldRef("ref-weekly-presale-gift-dangling", "lifecycle");
    store.updateField("prod-s3", "battery_months", 16, { actor: "wangyun" });
    const snapshot = store.getSnapshot();
    const doc = snapshot.docModels.find(
      (item) => item.exprId === "exp-spec-doc",
    )!;

    const vm = buildDocViewModel(snapshot, doc);

    expect(vm.justSyncedCount).toBe(2);
    expect(vm.howState).toBe("change");
    expect(vm.howLabel).toBe("刚刚同步 2 处引用");
  });

  it("keeps an unmatched document binding visible as dangling", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const source = workspace.docModels.find(
      (item) => item.exprId === "exp-spec-doc",
    )!;
    const doc = {
      ...source,
      binding: { objectId: "missing-object", state: "dangling" as const },
    };

    const vm = buildDocViewModel(workspace, doc);

    expect(vm.bindingObject).toBeNull();
    expect(vm.bindingState).toBe("dangling");
    expect(vm.bindingMessage).toBe("引用对象不存在");
    expect(vm.howState).toBe("danger");
  });

  it("filters field options and counts document text", () => {
    const seed = cloneDemoSeed();
    const fields = seed.objectTypes.find(
      (type) => type.code === "product_specs",
    )!.fields;
    const doc = seed.docModels.find((item) => item.exprId === "exp-spec-doc")!;

    expect(filterFieldOptions(fields, "防").map((field) => field.code)).toEqual(
      ["rating"],
    );
    expect(filterFieldOptions(fields, "")).toHaveLength(fields.length);
    expect(filterFieldOptions(fields, "nothing")).toHaveLength(0);
    expect(countDocText(doc.blocks)).toBeGreaterThan(80);
  });

  it("reduces popover keyboard navigation", () => {
    expect(
      popoverReducer(
        { open: true, activeIndex: 0 },
        { kind: "ArrowUp", size: 3 },
      ).state.activeIndex,
    ).toBe(2);
    expect(
      popoverReducer(
        { open: true, activeIndex: 2 },
        { kind: "ArrowDown", size: 3 },
      ).state.activeIndex,
    ).toBe(0);
    const enter = popoverReducer(
      { open: true, activeIndex: 1 },
      { kind: "Enter", size: 3 },
    );
    expect("selectedIndex" in enter ? enter.selectedIndex : undefined).toBe(1);
    expect(
      popoverReducer({ open: true, activeIndex: 1 }, { kind: "Escape" }).state
        .open,
    ).toBe(false);
  });
});
