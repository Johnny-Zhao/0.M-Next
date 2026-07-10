import type { DockviewApi } from "dockview";
import { describe, expect, it, vi } from "vitest";

import {
  controlledPanelAction,
  ensureWorkbenchPanels,
  isPrimaryView,
  leftPaneModeForPanel,
  openWorkbenchPanel,
  shouldOpenInspectorForSelection,
  workbenchDefaultsForTemplate,
} from "./workbench";

function createDockviewApiMock(panelCount = 0): {
  readonly api: DockviewApi;
  readonly addPanel: ReturnType<typeof vi.fn>;
} {
  const addPanel = vi.fn();
  const api = {
    panels: Array.from({ length: panelCount }, (_, index) => ({ id: index })),
    addPanel,
  } as unknown as DockviewApi;
  return { api, addPanel };
}

/**
 * Regression coverage for 字段总表 "打不进/不能编辑".
 *
 * Root cause: focusing an inline editor fired selection.select(field), whose
 * workbench subscriber revealed the inspector via openWorkbenchPanel, which
 * unconditionally called DockviewApi.focus(). That moved DOM focus onto the
 * inspector group and immediately blurred the input the user had just clicked,
 * so every keystroke turned into focus -> blur and nothing could be typed.
 *
 * Fix: selection-driven reveals must activate the panel WITHOUT stealing focus.
 */
describe("openWorkbenchPanel focus handling", () => {
  it("activates an existing panel without stealing focus when focus:false", () => {
    const setActive = vi.fn();
    const focus = vi.fn();
    const api = {
      getPanel: vi.fn(() => ({ api: { setActive } })),
      addPanel: vi.fn(),
      focus,
    } as unknown as DockviewApi;

    openWorkbenchPanel(api, "inspector", { focus: false });

    expect(setActive).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it("moves focus when a panel is opened explicitly (default)", () => {
    const setActive = vi.fn();
    const focus = vi.fn();
    const api = {
      getPanel: vi.fn(() => ({ api: { setActive } })),
      addPanel: vi.fn(),
      focus,
    } as unknown as DockviewApi;

    openWorkbenchPanel(api, "inspector");

    expect(setActive).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("adds and activates a missing panel without stealing focus when passive", () => {
    const panelSetActive = vi.fn();
    const focus = vi.fn();
    const addPanel = vi.fn(() => ({ api: { setActive: panelSetActive } }));
    const api = {
      getPanel: vi.fn(() => undefined),
      addPanel,
      focus,
    } as unknown as DockviewApi;

    openWorkbenchPanel(api, "inspector", { focus: false });

    expect(addPanel).toHaveBeenCalledTimes(1);
    expect(panelSetActive).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it("adds and focuses a missing panel when opened explicitly", () => {
    const panelSetActive = vi.fn();
    const focus = vi.fn();
    const addPanel = vi.fn(() => ({ api: { setActive: panelSetActive } }));
    const api = {
      getPanel: vi.fn(() => undefined),
      addPanel,
      focus,
    } as unknown as DockviewApi;

    openWorkbenchPanel(api, "inspector");

    expect(addPanel).toHaveBeenCalledTimes(1);
    expect(panelSetActive).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe("shouldOpenInspectorForSelection", () => {
  it("reveals the inspector for object and field selections", () => {
    expect(
      shouldOpenInspectorForSelection({
        entityType: "object",
        entityId: "obj-1",
      }),
    ).toBe(true);
    expect(
      shouldOpenInspectorForSelection({
        entityType: "field",
        entityId: "obj-1",
        fieldCode: "power_w",
      }),
    ).toBe(true);
  });

  it("does not reveal the inspector for relations or empty selection", () => {
    expect(
      shouldOpenInspectorForSelection({
        entityType: "relation",
        entityId: "rel-1",
      }),
    ).toBe(false);
    expect(shouldOpenInspectorForSelection(null)).toBe(false);
  });
});

describe("ensureWorkbenchPanels", () => {
  it("preloads only diagram and the right inspector for technical proposal", () => {
    const { api, addPanel } = createDockviewApiMock();

    ensureWorkbenchPanels(api, "technical_proposal");

    const panelIds = addPanel.mock.calls.map(([panel]) => panel.id);
    expect(panelIds).toEqual(["diagram", "inspector"]);
    expect(panelIds).not.toContain("tree");
    expect(panelIds).not.toContain("validate");
    expect(panelIds).not.toContain("table");
    expect(panelIds).not.toContain("matrix");
    expect(panelIds).not.toContain("mapping");
    expect(panelIds).not.toContain("floorplan");
    expect(panelIds).not.toContain("document");
    expect(addPanel.mock.calls[1]?.[0]).toMatchObject({
      id: "inspector",
      inactive: true,
      initialWidth: 320,
      position: { direction: "right", referencePanel: "diagram" },
    });
  });

  it("keeps the full default preload for non technical proposal templates", () => {
    const { api, addPanel } = createDockviewApiMock();

    ensureWorkbenchPanels(api, "interior_design");

    const panelIds = addPanel.mock.calls.map(([panel]) => panel.id);
    expect(panelIds).toContain("tree");
    expect(panelIds).toContain("validate");
    expect(panelIds).toContain("table");
    expect(panelIds).toContain("matrix");
    expect(panelIds).toContain("mapping");
    expect(panelIds).toContain("floorplan");
    expect(panelIds).toContain("document");
    expect(panelIds).toContain("inspector");
  });

  it("does not add panels when a layout already exists", () => {
    const { api, addPanel } = createDockviewApiMock(1);

    ensureWorkbenchPanels(api, "technical_proposal");

    expect(addPanel).not.toHaveBeenCalled();
  });
});

describe("workbenchDefaultsForTemplate", () => {
  it("opens technical proposal projects on the diagram view", () => {
    expect(workbenchDefaultsForTemplate("technical_proposal")).toMatchObject({
      activePanel: "diagram",
      objectType: "module",
      relationType: "proposal_contains_module",
      startupPanels: [],
    });
  });

  it("keeps non technical proposal defaults unchanged", () => {
    expect(workbenchDefaultsForTemplate("interior_design")).toMatchObject({
      activePanel: "tree",
      startupPanels: [],
    });
  });
});

describe("leftPaneModeForPanel", () => {
  it("switches the technical proposal left pane by active view", () => {
    expect(leftPaneModeForPanel("diagram")).toBe("diagram-tools");
    expect(leftPaneModeForPanel("table")).toBe("view-tree");
    expect(leftPaneModeForPanel("matrix")).toBe("view-tree");
    expect(leftPaneModeForPanel("document")).toBe("view-tree");
  });
});

describe("technical proposal controlled panels", () => {
  it("identifies primary views rendered without Dockview", () => {
    expect(isPrimaryView("diagram")).toBe(true);
    expect(isPrimaryView("table")).toBe(true);
    expect(isPrimaryView("matrix")).toBe(true);
    expect(isPrimaryView("document")).toBe(true);
    expect(isPrimaryView("inspector")).toBe(false);
    expect(isPrimaryView("tree")).toBe(false);
    expect(isPrimaryView("validate")).toBe(false);
  });

  it("maps panel requests to controlled main-view and right-column state", () => {
    expect(controlledPanelAction("diagram")).toEqual({
      activePanel: "diagram",
      leftPaneMode: "diagram-tools",
    });
    expect(controlledPanelAction("table")).toEqual({
      activePanel: "table",
      leftPaneMode: "view-tree",
    });
    expect(controlledPanelAction("tree")).toEqual({
      activePanel: "diagram",
      leftPaneMode: "diagram-tools",
    });
    expect(controlledPanelAction("inspector")).toEqual({
      inspectorOpen: true,
    });
    expect(controlledPanelAction("validate")).toEqual({ validateOpen: true });
    expect(controlledPanelAction("ai")).toEqual({});
  });
});
