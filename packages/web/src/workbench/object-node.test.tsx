import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ObjectNode,
  type ObjectNodeData,
  type ObjectVisualState,
} from "./object-node";

vi.mock("./ports", () => ({
  PortHandles: () => <i className="mock-port-handles" />,
}));

const baseData: ObjectNodeData = {
  title: "供电子系统",
  objectType: "分系统",
  status: "ACTIVE",
  code: "PWR",
  typeVariant: "subsystem",
  fields: [
    { code: "length_m", label: "长", value: "4.7 m" },
    { code: "orientation", label: "朝向", value: "南" },
  ],
  derivedChips: [
    { label: "面积", value: "23.5", unit: "㎡" },
    { label: "窗地比", value: "0.078" },
  ],
  ruleStatus: "OK",
  provenanceText: "来源 人工绘制 · 新鲜 12m",
  visualState: "default",
  readonly: false,
};

describe("ObjectNode", () => {
  it("renders governed object parts and p2c port handles", () => {
    const html = renderNode(baseData);

    expect(html).toContain("mock-port-handles");
    expect(html).toContain("object-node-subsystem");
    expect(html).toContain("PWR");
    expect(html).toContain("供电子系统");
    expect(html).toContain("长");
    expect(html).toContain("4.7 m");
    expect(html).toContain("面积");
    expect(html).toContain("23.5");
    expect(html).toContain("窗地比");
    expect(html).toContain("后端实时·只读");
    expect(html).toContain("rule-lamp-ok");
    expect(html).toContain("来源 人工绘制");
    expect(html).not.toContain("TODO");
  });

  it("omits derived and provenance chrome when the view has no data", () => {
    const html = renderNode({
      ...baseData,
      derivedChips: [],
      provenanceText: null,
    });

    expect(html).not.toContain("fx-chip");
    expect(html).not.toContain("provenance-passport");
  });

  it("renders the required visual states", () => {
    const states: readonly ObjectVisualState[] = [
      "default",
      "recomputing",
      "blocked",
      "stale",
      "vetoed",
    ];

    for (const state of states) {
      expect(renderNode({ ...baseData, visualState: state })).toContain(
        `object-node-state-${state}`,
      );
    }
  });

  it("renders type variants and rule lamp states", () => {
    for (const typeVariant of [
      "subsystem",
      "component",
      "interface",
      "requirement",
      "room",
    ] as const) {
      expect(renderNode({ ...baseData, typeVariant })).toContain(
        `object-node-${typeVariant}`,
      );
    }

    for (const ruleStatus of [
      "BLOCK",
      "WARN",
      "OK",
      "UNKNOWN",
      "TODO",
    ] as const) {
      expect(renderNode({ ...baseData, ruleStatus })).toContain(
        `rule-lamp-${ruleStatus.toLowerCase()}`,
      );
    }
  });

  it("renders a dimension empty state without inventing fields", () => {
    const html = renderNode({
      ...baseData,
      activeDimension: "thermal",
      dimensionLabel: "热",
      dimensionTone: "empty",
      dimensionEmpty: true,
      fields: [],
    });

    expect(html).toContain("object-node-dimension-thermal");
    expect(html).toContain("object-node-dimension-tone-empty");
    expect(html).toContain("该维度无数据");
    expect(html).not.toContain("4.7 m");
  });
});

function renderNode(data: ObjectNodeData): string {
  return renderToStaticMarkup(
    ObjectNode({
      data,
      selected: data.visualState === "blocked",
    } as Parameters<typeof ObjectNode>[0]),
  );
}
