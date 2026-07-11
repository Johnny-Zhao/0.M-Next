import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  buildPluginFormOptions,
  buildPluginsViewModel,
} from "./plugins-view-model";

describe("plugins view model", () => {
  it("derives live counts, filters and selected detail", () => {
    const state = new WorkspaceStore(cloneDemoSeed()).getSnapshot();

    const all = buildPluginsViewModel(state);
    const enabled = buildPluginsViewModel(state, { status: "enabled" });
    const updates = buildPluginsViewModel(state, { status: "updates" });
    const industry = buildPluginsViewModel(state, { industry: "建筑工程" });

    expect(all.counts).toMatchObject({ all: 6, enabled: 3, updates: 1 });
    expect(
      all.counts.industries.find((item) => item.industry === "建筑工程")?.count,
    ).toBe(2);
    expect(enabled.cards).toHaveLength(3);
    expect(updates.cards.map((card) => card.id)).toEqual(["plug-3d-assembly"]);
    expect(industry.cards.map((card) => card.id)).toEqual([
      "plug-gantt-plus",
      "plug-bim-view",
    ]);
    expect(all.selected?.usedByNames).toEqual(["全屋智能门户方案"]);
  });

  it("searches by name, tagline and provided form names", () => {
    const state = new WorkspaceStore(cloneDemoSeed()).getSnapshot();

    expect(
      buildPluginsViewModel(state, { query: "甘特" }).cards.map(
        (card) => card.id,
      ),
    ).toEqual(["plug-gantt-plus"]);
    expect(
      buildPluginsViewModel(state, { query: "爆炸图" }).cards.map(
        (card) => card.id,
      ),
    ).toEqual(["plug-3d-assembly"]);
    expect(
      buildPluginsViewModel(state, { query: "现金流" }).cards.map(
        (card) => card.id,
      ),
    ).toEqual(["plug-finsuite"]);
  });

  it("derives AddFormMenu options from enabled plugin forms", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    expect(buildPluginFormOptions(store.getPlugins())).toHaveLength(7);
    store.setPluginState(
      "plug-finsuite",
      { installed: true, enabled: true },
      "wangyun",
    );
    expect(buildPluginFormOptions(store.getPlugins())).toHaveLength(10);
    store.setPluginState("plug-3d-assembly", { enabled: false }, "wangyun");
    expect(
      buildPluginFormOptions(store.getPlugins()).map((option) => option.label),
    ).not.toContain("三维架构图 · 爆炸图");
    expect(
      buildPluginsViewModel(store.getSnapshot(), {
        selectedId: "plug-3d-assembly",
      }).selected,
    ).toMatchObject({ installed: true, enabled: false });
    store.setPluginState("plug-3d-assembly", { enabled: true }, "wangyun");
    expect(
      buildPluginFormOptions(store.getPlugins()).map((option) => option.label),
    ).toContain("三维架构图 · 爆炸图");
  });
});
