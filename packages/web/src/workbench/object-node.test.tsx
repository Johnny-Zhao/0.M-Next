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
    { code: "voltage", value: "28" },
    { code: "owner", value: "AOCS" },
  ],
  fxText: "fx_score=92",
  ruleStatus: "OK",
  provenanceText: "ACTIVE / TODO(view-API): provenance",
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
    expect(html).toContain("voltage");
    expect(html).toContain("fx_score=92");
    expect(html).toContain("rule-lamp-ok");
    expect(html).toContain("TODO(view-API): provenance");
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
    ] as const) {
      expect(renderNode({ ...baseData, typeVariant })).toContain(
        `object-node-${typeVariant}`,
      );
    }

    for (const ruleStatus of ["BLOCK", "WARN", "OK", "TODO"] as const) {
      expect(renderNode({ ...baseData, ruleStatus })).toContain(
        `rule-lamp-${ruleStatus.toLowerCase()}`,
      );
    }
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
