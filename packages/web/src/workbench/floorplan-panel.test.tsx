import { describe, expect, it } from "vitest";

import type { RelationSummary, ViewObject } from "@m-next/views";

import {
  buildFloorplanRooms,
  floorplanDimensionOptions,
} from "./floorplan-panel";

describe("floorplan panel layout", () => {
  it("sizes rooms from room dimensions and uses real derived area chips", () => {
    const layout = buildFloorplanRooms(
      [
        room("room-kitchen", "厨房", "OK", {
          length_m: 3.2,
          width_m: 2.4,
          light_df: 2.8,
        }),
        room("room-living", "客厅", "OK", {
          length_m: 5.6,
          width_m: 4.2,
          light_df: 3.2,
        }),
        room("room-master", "主卧", "WARN", {
          length_m: 4.2,
          width_m: 3.6,
          wind_ach: 0.7,
        }),
      ],
      [
        relation("room-living", "room-kitchen"),
        relation("room-living", "room-master"),
      ],
      "room-master",
      "all",
    );

    expect(layout.rooms.map((block) => block.id)).toEqual([
      "room-living",
      "room-kitchen",
      "room-master",
    ]);
    expect(layout.mode).toBe("fallback");
    expect(layout.rooms[0]?.width).toBeGreaterThan(
      layout.rooms[0]?.height ?? 0,
    );
    expect(layout.rooms[0]?.areaChip).toEqual({
      label: "面积",
      value: "23.52",
      unit: "㎡",
    });
    expect(layout.rooms[0]?.object.ruleStatus).toBe("OK");
    expect(layout.rooms[2]?.selected).toBe(true);
  });

  it("uses plan coordinates when every room has layout data", () => {
    const layout = buildFloorplanRooms(
      [
        room("room-living", "客厅", "OK", {
          length_m: 5.6,
          width_m: 4.2,
          plan_x: 0,
          plan_y: 0,
        }),
        room("room-kitchen", "厨房", "OK", {
          length_m: 3.2,
          width_m: 2.4,
          plan_x: 5.6,
          plan_y: 0,
        }),
        room("room-master", "主卧", "WARN", {
          length_m: 4.2,
          width_m: 3.6,
          plan_x: 0,
          plan_y: 4.2,
        }),
      ],
      [],
      null,
      "all",
    );

    const living = layout.rooms.find((block) => block.id === "room-living");
    const kitchen = layout.rooms.find((block) => block.id === "room-kitchen");
    const master = layout.rooms.find((block) => block.id === "room-master");

    expect(layout.mode).toBe("coordinate");
    expect(kitchen?.x).toBeGreaterThan(living?.x ?? 0);
    expect(master?.y).toBeLessThan(living?.y ?? 0);
    expect(living?.width).toBeGreaterThan(kitchen?.width ?? 0);
    expect(layout.width).toBeGreaterThan(500);
  });

  it("switches floorplan dimension tones without moving rooms", () => {
    const objects = [
      room("room-second", "暗次卧", "BLOCK", {
        length_m: 3.4,
        width_m: 3,
        light_df: 1.4,
        thermal_temp: 22,
        wind_ach: 1.1,
      }),
      room("room-master", "主卧", "WARN", {
        length_m: 4.2,
        width_m: 3.6,
        light_df: 2.6,
        thermal_temp: 24,
        wind_ach: 0.7,
      }),
    ];

    const all = buildFloorplanRooms(objects, [], null, "all");
    const light = buildFloorplanRooms(objects, [], null, "light");
    const thermal = buildFloorplanRooms(objects, [], null, "thermal");
    const wind = buildFloorplanRooms(objects, [], null, "wind");

    expect(light.rooms.map((block) => [block.x, block.y])).toEqual(
      all.rooms.map((block) => [block.x, block.y]),
    );
    expect(thermal.rooms.map((block) => [block.x, block.y])).toEqual(
      all.rooms.map((block) => [block.x, block.y]),
    );
    expect(wind.rooms.map((block) => [block.x, block.y])).toEqual(
      all.rooms.map((block) => [block.x, block.y]),
    );
    expect(light.rooms[0]?.tone).toBe("block");
    expect(thermal.rooms[0]?.tone).toBe("ok");
    expect(wind.rooms[1]?.tone).toBe("warn");
  });

  it("offers the interior floorplan dimensions", () => {
    expect(
      floorplanDimensionOptions().map((dimension) => dimension.label),
    ).toEqual(["全部", "光", "热", "风"]);
  });
});

function room(
  objectId: string,
  name: string,
  ruleStatus: ViewObject["ruleStatus"],
  fields: Readonly<Record<string, unknown>>,
): ViewObject {
  const length = Number(fields.length_m);
  const width = Number(fields.width_m);
  return {
    objectId,
    objectType: "room",
    status: "ACTIVE",
    version: 1,
    fields: { name, ...fields },
    derived: Number.isFinite(length * width) ? { area_fx: length * width } : {},
    updatedAt: "2026-06-21T00:00:00Z",
    source: "manual",
    ruleStatus,
  };
}

function relation(sourceId: string, targetId: string): RelationSummary {
  return {
    relationId: `${sourceId}-${targetId}`,
    relationType: "adjacent",
    sourceId,
    targetId,
    version: 1,
  };
}
