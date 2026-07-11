import { describe, expect, it } from "vitest";

import { alignCanvasNodes, sizeCanvasNodes } from "./align";

const nodes = [
  { objectId: "a", x: 20, y: 40, w: 100, h: 80 },
  { objectId: "b", x: 180, y: 120, w: 120, h: 60 },
  { objectId: "c", x: 420, y: 240, w: 140, h: 90 },
] as const;

describe("canvas align helpers", () => {
  it("aligns selected nodes without moving unselected nodes", () => {
    const aligned = alignCanvasNodes(nodes, new Set(["a", "b"]), "right");

    expect(aligned[0]?.x).toBe(200);
    expect(aligned[1]?.x).toBe(180);
    expect(aligned[2]).toBe(nodes[2]);
  });

  it("uses the first selected node as the same-size source", () => {
    const resized = sizeCanvasNodes(nodes, new Set(["a", "b"]), "sameSize");

    expect(resized[0]).toMatchObject({ w: 100, h: 80 });
    expect(resized[1]).toMatchObject({ w: 100, h: 80 });
    expect(resized[2]).toBe(nodes[2]);
  });

  it("returns an unchanged copy when fewer than two nodes are selected", () => {
    const result = alignCanvasNodes(nodes, new Set(["a"]), "left");

    expect(result).not.toBe(nodes);
    expect(result).toEqual(nodes);
  });
});
