import { describe, expect, it, vi } from "vitest";

import type { RelationSummary, ViewObject } from "@m-next/views";

import {
  buildFloorplanRooms,
  floorplanDimensionOptions,
  floorplanHeatTone,
  floorplanProfileForWorkbench,
  loadFloorplanData,
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
      fieldCode: "area_fx",
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

  it("loads technical proposal modules and systems for layout", async () => {
    const moduleObject = technicalObject("module-a", "编排模块", "module", 200);
    const systemObject = technicalObject("system-a", "控制系统", "system", 50);
    const viewClient = {
      objects: vi.fn(async (_workspaceId: string, objectType: string) => ({
        items:
          objectType === "module"
            ? [moduleObject]
            : objectType === "system"
              ? [systemObject]
              : [],
      })),
      relations: vi.fn(async () => []),
    };

    await expect(
      loadFloorplanData({
        viewClient,
        workspaceId: "workspace-1",
        rootId: "proposal-root",
        profile: "technical",
      }),
    ).resolves.toEqual({
      objects: [moduleObject, systemObject],
      relations: [],
    });
    expect(viewClient.objects).toHaveBeenCalledWith(
      "workspace-1",
      "module",
      0,
      100,
    );
    expect(viewClient.objects).toHaveBeenCalledWith(
      "workspace-1",
      "system",
      0,
      100,
    );
    expect(viewClient.relations).not.toHaveBeenCalled();
  });

  it("lays out technical proposal blocks from power and rule status", () => {
    const layout = buildFloorplanRooms(
      [
        technicalObject("module-small", "适配模块", "module", 0, "OK"),
        technicalObject("module-large", "编排模块", "module", 200, "BLOCK"),
        technicalObject("system-a", "控制系统", "system", undefined, "WARN"),
      ],
      [],
      "module-large",
      "all",
      "technical",
    );

    const small = layout.rooms.find((block) => block.id === "module-small");
    const large = layout.rooms.find((block) => block.id === "module-large");
    const system = layout.rooms.find((block) => block.id === "system-a");

    expect(large?.width).toBeGreaterThan(small?.width ?? 0);
    expect(small?.areaChip).toMatchObject({
      label: "功率",
      value: "0",
      unit: "W",
    });
    expect(system?.areaChip).toMatchObject({
      label: "功率",
      value: "0",
      unit: "W",
    });
    expect(large?.tone).toBe("block");
    expect(system?.tone).toBe("warn");
    expect(large?.selected).toBe(true);
  });

  it("offers technical proposal dimensions and detects the profile", () => {
    expect(
      floorplanDimensionOptions("technical").map(
        (dimension) => dimension.label,
      ),
    ).toEqual(["全部", "能量", "功率"]);
    expect(
      floorplanProfileForWorkbench({
        objectType: "module",
        relationType: "proposal_contains_module",
      }),
    ).toBe("technical");
  });

  it("maps loaded time-series values to semantic heat tones", () => {
    expect(floorplanHeatTone(18, 18, 30)).toBe("low");
    expect(floorplanHeatTone(24, 18, 30)).toBe("mid");
    expect(floorplanHeatTone(30, 18, 30)).toBe("high");
    expect(floorplanHeatTone(22, 22, 22)).toBe("flat");
    expect(floorplanHeatTone(null, 18, 30)).toBeNull();
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

function technicalObject(
  objectId: string,
  name: string,
  objectType: string,
  power: number | undefined,
  ruleStatus: ViewObject["ruleStatus"] = "OK",
): ViewObject {
  return {
    objectId,
    objectType,
    status: "ACTIVE",
    version: 1,
    fields: power === undefined ? { name } : { name, power_w: power },
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
