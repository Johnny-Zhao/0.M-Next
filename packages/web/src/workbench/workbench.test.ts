import type { DockviewApi } from "dockview";
import { describe, expect, it, vi } from "vitest";

import {
  openWorkbenchPanel,
  shouldOpenInspectorForSelection,
} from "./workbench";

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
