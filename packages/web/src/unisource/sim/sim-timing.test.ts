import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { deriveSimTimeline, protocolDelay } from "./sim-timing";

describe("sim timing", () => {
  it("derives demo event times from relation protocol fields", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const workspace = store.getSnapshot();
    const scenario = workspace.simScenarios[0]!;

    const timeline = deriveSimTimeline(scenario, workspace, "normal");

    expect(timeline.events.map((event) => event.at)).toEqual([0, 0.4, 1, 3.2]);
    expect(timeline.duration).toBe(10);
    expect(timeline.endToEnd).toBe(3.2);
    expect(timeline.retries).toBe(0);
  });

  it("applies weak network multiplier and retry count", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const scenario = workspace.simScenarios[0]!;

    const timeline = deriveSimTimeline(scenario, workspace, "weak");

    expect(timeline.events.map((event) => event.at)).toEqual([
      0, 0.6, 1.5, 4.8,
    ]);
    expect(timeline.endToEnd).toBe(4.8);
    expect(timeline.retries).toBe(3);
  });

  it("changes downstream timings when a relation protocol changes", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    store.updateRelationField(
      "rel-s3-g2-interconnect",
      "protocol",
      "联动录像",
      { actor: "lixiao" },
    );
    const workspace = store.getSnapshot();
    const scenario = workspace.simScenarios[0]!;

    const timeline = deriveSimTimeline(scenario, workspace, "normal");

    expect(protocolDelay("未知协议")).toBe(0.5);
    expect(timeline.events.map((event) => event.at)).toEqual([
      0, 2.8, 3.4, 5.6,
    ]);
    expect(timeline.endToEnd).toBe(5.6);
  });

  it("does not write workspace state while deriving playback data", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const beforeEvents = store.getChangeEvents().length;
    const beforeVersion = store.getWorkspace().updatedAt;
    const workspace = store.getSnapshot();

    deriveSimTimeline(workspace.simScenarios[0]!, workspace, "normal");

    expect(store.getChangeEvents()).toHaveLength(beforeEvents);
    expect(store.getWorkspace().updatedAt).toBe(beforeVersion);
  });

  it("reports dangling simulation events without playing them", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const scenario = {
      ...workspace.simScenarios[0]!,
      events: [
        {
          ...workspace.simScenarios[0]!.events[0]!,
          nodeObjectId: "missing-object",
          state: "dangling" as const,
        },
      ],
    };

    const timeline = deriveSimTimeline(scenario, workspace, "normal");

    expect(timeline.events).toEqual([]);
    expect(timeline.danglingEvents).toEqual([
      { id: scenario.events[0]!.id, message: "引用对象不存在" },
    ]);
  });
});
