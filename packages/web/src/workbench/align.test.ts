import { describe, expect, it } from "vitest";

import { alignNodes, distributeNodes, type AlignableNode } from "./align";

function node(
  id: string,
  x: number,
  y: number,
  width = 40,
  height = 20,
): AlignableNode {
  return { id, position: { x, y }, width, height };
}

const selected = new Set(["a", "b", "c"]);

function positions(nodes: readonly AlignableNode[]) {
  return nodes.map(({ id, position }) => [id, position.x, position.y]);
}

describe("alignNodes", () => {
  const nodes = [
    node("a", 20, 50, 30, 20),
    node("b", 80, 10, 40, 30),
    node("c", 140, 90, 20, 40),
    node("outside", 5, 5),
  ];

  it("aligns selected nodes to the left edge", () => {
    expect(positions(alignNodes(nodes, selected, "left"))).toEqual([
      ["a", 20, 50],
      ["b", 20, 10],
      ["c", 20, 90],
      ["outside", 5, 5],
    ]);
  });

  it("aligns selected nodes to the right edge", () => {
    expect(positions(alignNodes(nodes, selected, "right"))).toEqual([
      ["a", 130, 50],
      ["b", 120, 10],
      ["c", 140, 90],
      ["outside", 5, 5],
    ]);
  });

  it("aligns selected nodes to the top edge", () => {
    expect(positions(alignNodes(nodes, selected, "top"))).toEqual([
      ["a", 20, 10],
      ["b", 80, 10],
      ["c", 140, 10],
      ["outside", 5, 5],
    ]);
  });

  it("aligns selected nodes to the bottom edge", () => {
    expect(positions(alignNodes(nodes, selected, "bottom"))).toEqual([
      ["a", 20, 110],
      ["b", 80, 100],
      ["c", 140, 90],
      ["outside", 5, 5],
    ]);
  });

  it("aligns selected nodes to the horizontal center", () => {
    expect(positions(alignNodes(nodes, selected, "horizontalCenter"))).toEqual([
      ["a", 75, 50],
      ["b", 70, 10],
      ["c", 80, 90],
      ["outside", 5, 5],
    ]);
  });

  it("aligns selected nodes to the vertical center", () => {
    expect(positions(alignNodes(nodes, selected, "verticalCenter"))).toEqual([
      ["a", 20, 60],
      ["b", 80, 55],
      ["c", 140, 50],
      ["outside", 5, 5],
    ]);
  });
});

describe("distributeNodes", () => {
  it("distributes selected nodes with equal horizontal gaps", () => {
    const nodes = [
      node("a", 0, 10, 20),
      node("b", 30, 30, 40),
      node("c", 180, 50, 20),
    ];

    expect(positions(distributeNodes(nodes, selected, "horizontal"))).toEqual([
      ["a", 0, 10],
      ["b", 80, 30],
      ["c", 180, 50],
    ]);
  });

  it("distributes selected nodes with equal vertical gaps", () => {
    const nodes = [
      node("a", 10, 0, 40, 20),
      node("b", 30, 25, 40, 40),
      node("c", 50, 180, 40, 20),
    ];

    expect(positions(distributeNodes(nodes, selected, "vertical"))).toEqual([
      ["a", 10, 0],
      ["b", 30, 80],
      ["c", 50, 180],
    ]);
  });
});
