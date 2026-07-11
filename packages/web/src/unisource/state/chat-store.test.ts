import { afterEach, describe, expect, it, vi } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { ChangeSetStore } from "./changeset-store";
import { ChatStore, matchScript } from "./chat-store";
import { SessionStore } from "./session-store";
import { WorkspaceStore } from "./workspace-store";

describe("ChatStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches scripted prompts", () => {
    expect(matchScript("把续航改到 14,并加活跃渠道")).toBe("batteryAndKpi");
    expect(matchScript("解释客单价为什么下降")).toBe("aov");
    expect(matchScript("随便问一句")).toBe("fallback");
  });

  it("applies Wangyun AI actions and can undo all", () => {
    vi.useFakeTimers();
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);
    const chat = new ChatStore(workspace, changes, seed);

    chat.send("把续航改到 14,并加活跃渠道数", session);
    expect(chat.getSnapshot().typing).toBe(true);
    vi.advanceTimersByTime(450);
    const ai = chat.getSnapshot().messages.at(-1)!;

    expect(chat.getSnapshot().typing).toBe(false);
    expect(chat.getSnapshot().actionCards.map((card) => card.status)).toEqual([
      "applied",
      "applied",
    ]);
    expect(
      workspace
        .getChangeEvents()
        .slice(0, 2)
        .map((event) => event.track),
    ).toEqual(["view", "data"]);

    chat.undoAll(ai.id);

    expect(workspace.getObject("prod-s3")?.fields.battery_months?.value).toBe(
      12,
    );
    expect(
      workspace.getKpis().find((kpi) => kpi.id === "kpi-active-channels")
        ?.visible,
    ).toBe(false);
    expect(
      chat.getSnapshot().actionCards.every((card) => card.status === "undone"),
    ).toBe(true);
  });

  it("keeps Chenmo AI data changes pending without writing", () => {
    vi.useFakeTimers();
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed);
    const changes = new ChangeSetStore(seed, workspace);
    const session = new SessionStore(workspace, changes);
    const chat = new ChatStore(workspace, changes, seed);
    session.switchMember("chenmo");
    const beforeEvents = workspace.getChangeEvents().length;

    chat.send("把续航改到 14,并加活跃渠道数", session);
    vi.advanceTimersByTime(450);

    expect(workspace.getChangeEvents()).toHaveLength(beforeEvents);
    expect(chat.getSnapshot().actionCards[0]?.status).toBe("pending");
    expect(
      changes.getPending().some((changeSet) => changeSet.actor === "chenmo"),
    ).toBe(true);
  });
});
