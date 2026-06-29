import { describe, expect, it, vi } from "vitest";

import type { SimResultSeriesPoint, SimRunSummary } from "../api/view-client";
import {
  TimePlayhead,
  nearestSeriesPoint,
  seriesDomain,
} from "./time-playhead";

describe("TimePlayhead", () => {
  it("finds the closest already-loaded frame without changing series data", () => {
    const points = [
      point("room-1", "thermal_temp", 0, 18),
      point("room-1", "thermal_temp", 10, 24),
      point("room-1", "thermal_temp", 20, 30),
    ];

    expect(seriesDomain(points)).toEqual({ min: 0, max: 20 });
    expect(nearestSeriesPoint(points, 14)?.value).toBe(24);
  });

  it("renders run object field selectors and playhead controls", () => {
    const element = TimePlayhead({
      runs: [run("run-1")],
      objectOptions: [{ id: "room-1", label: "客厅" }],
      fieldOptions: [{ id: "thermal_temp", label: "thermal_temp" }],
      selectedRunId: "run-1",
      selectedObjectId: "room-1",
      selectedFieldCode: "thermal_temp",
      currentTime: 5,
      points: [point("room-1", "thermal_temp", 0, 18)],
      playing: false,
      loading: false,
      statusText: "t=5",
      onRunChange: vi.fn(),
      onObjectChange: vi.fn(),
      onFieldChange: vi.fn(),
      onTimeChange: vi.fn(),
      onPlayingChange: vi.fn(),
    });

    const rendered = JSON.stringify(element);
    expect(rendered).toContain("engine");
    expect(rendered).toContain("客厅");
    expect(rendered).toContain("播放");
  });
});

function run(runId: string): SimRunSummary {
  return {
    runId,
    snapshotId: "snapshot-1",
    engineId: "engine",
    status: "COMPLETED",
    queuedAt: "2026-06-29T00:00:00Z",
    startedAt: "2026-06-29T00:00:01Z",
    completedAt: "2026-06-29T00:00:02Z",
    resultHash: "hash",
    createdBy: "tester",
  };
}

function point(
  objectId: string,
  fieldCode: string,
  t: number,
  value: number,
): SimResultSeriesPoint {
  return { objectId, fieldCode, t, value, valueJson: null };
}
