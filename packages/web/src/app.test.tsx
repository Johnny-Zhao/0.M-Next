import { describe, expect, it } from "vitest";

import { App, syncLabel } from "./app";
import {
  coerceEditedValue,
  saveDrivingField,
} from "./workbench/inspector-panel";
import { objectsAndRelationsToFlow } from "./workbench/diagram-panel";
import { workbenchPanelDefinitions } from "./workbench/workbench";

describe("App", () => {
  it("creates the application shell", () => {
    expect(typeof App).toBe("function");
    expect(syncLabel({ pendingEvents: 0, caughtUp: true })).toContain("绿");
    expect(syncLabel({ pendingEvents: 3, caughtUp: false })).toContain("黄");
    expect(syncLabel("error")).toContain("红");
  });

  it("registers the dockable workbench panels", () => {
    expect(workbenchPanelDefinitions.map((panel) => panel.title)).toEqual([
      "图",
      "平面图",
      "表格",
      "矩阵",
      "文档",
      "模型树",
      "属性/校验",
      "校验",
      "AI 助手",
      "批注",
      "交换",
    ]);
  });

  it("maps objects and relations to React Flow nodes and edges", () => {
    const flow = objectsAndRelationsToFlow(
      [
        {
          objectId: "obj-a",
          objectType: "demo_object",
          status: "DRAFT",
          version: 1,
          fields: { name: "对象A", length_m: 4, width_m: 3 },
          derived: { area_fx: 12 },
          updatedAt: "2026-06-21T00:00:00Z",
          source: "manual",
          ruleStatus: "OK",
        },
        {
          objectId: "obj-b",
          objectType: "demo_object",
          status: "DRAFT",
          version: 1,
          fields: { name: "对象B" },
          updatedAt: "2026-06-21T00:00:00Z",
          source: null,
          ruleStatus: "OK",
        },
      ],
      [
        {
          relationId: "rel-1",
          relationType: "depends_on",
          sourceId: "obj-a",
          targetId: "obj-b",
          version: 1,
        },
      ],
      "obj-b",
    );

    expect(flow.nodes).toHaveLength(2);
    expect(flow.edges).toHaveLength(1);
    expect(flow.nodes[1]?.selected).toBe(true);
    expect(flow.nodes[0]?.data.derivedChips).toContainEqual({
      fieldCode: "area_fx",
      label: "面积",
      value: "12",
      unit: "㎡",
    });
    expect(flow.nodes[0]?.data.provenanceText).toContain("人工绘制");
    expect(
      objectsAndRelationsToFlow(
        [
          {
            objectId: "obj-a",
            objectType: "demo_object",
            status: "DRAFT",
            version: 1,
            fields: { name: "对象A" },
            updatedAt: "2026-06-21T00:00:00Z",
            source: null,
            ruleStatus: "OK",
          },
          {
            objectId: "obj-b",
            objectType: "demo_object",
            status: "DRAFT",
            version: 1,
            fields: { name: "对象B" },
            updatedAt: "2026-06-21T00:00:00Z",
            source: null,
            ruleStatus: "OK",
          },
        ],
        [],
        ["obj-a", "obj-b"],
      ).nodes.every((node) => node.selected),
    ).toBe(true);
  });

  it("switches dimension overlays without moving diagram nodes", () => {
    const objects = [
      {
        objectId: "obj-a",
        objectType: "demo_object",
        status: "DRAFT",
        version: 1,
        fields: { name: "对象A", energy_soc: 83, temperature: "42C" },
        updatedAt: "2026-06-21T00:00:00Z",
        source: null,
        ruleStatus: "OK" as const,
      },
    ];

    const all = objectsAndRelationsToFlow(objects, [], null, "all");
    const energy = objectsAndRelationsToFlow(objects, [], null, "energy");

    expect(energy.nodes[0]?.position).toEqual(all.nodes[0]?.position);
    expect(all.nodes[0]?.data.fields.map((field) => field.code)).toEqual([
      "energy_soc",
      "temperature",
    ]);
    expect(energy.nodes[0]?.data.fields.map((field) => field.code)).toEqual([
      "energy_soc",
    ]);
    expect(energy.nodes[0]?.data.activeDimension).toBe("energy");
  });

  it("saves a driving field through the command client", async () => {
    const calls: unknown[] = [];
    await saveDrivingField(
      {
        updateFields: async (...args: unknown[]) => {
          calls.push(args);
        },
      },
      "workspace-1",
      {
        objectId: "obj-a",
        objectType: "demo_object",
        status: "DRAFT",
        version: 7,
        fields: { name: "旧值" },
        updatedAt: "2026-06-21T00:00:00Z",
        source: null,
        ruleStatus: "OK",
      },
      "name",
      "新值",
    );

    expect(calls).toEqual([
      [
        "workspace-1",
        "obj-a",
        7,
        [
          {
            fieldDefCode: "name",
            value: "新值",
          },
        ],
      ],
    ]);
    expect(coerceEditedValue("42", 1)).toBe(42);
    expect(coerceEditedValue("true", false)).toBe(true);
  });
});
