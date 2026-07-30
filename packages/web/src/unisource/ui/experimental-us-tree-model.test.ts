import { describe, expect, it } from "vitest";

import {
  deriveExperimentalTreeSearch,
  filterExperimentalTree,
  reorderExperimentalDirectorySiblings,
  treeStateFor,
  type ExperimentalUsTreeNode,
} from "./experimental-us-tree-model";

const nodes: ExperimentalUsTreeNode[] = [
  {
    key: "directory:one",
    kind: "directory",
    label: "采购目录",
    children: [
      {
        key: "library:one",
        kind: "record-library",
        label: "方案库",
        children: [
          {
            key: "record:one",
            kind: "record",
            label: "标准方案",
            children: [{ key: "field:one", kind: "field", label: "方案名称" }],
          },
        ],
      },
    ],
  },
];

describe("experimental tree model", () => {
  it("keeps stable keys and the four UniSource node kinds", () => {
    expect(nodes[0]?.key).toBe("directory:one");
    expect(nodes[0]?.children?.[0]?.kind).toBe("record-library");
    expect(nodes[0]?.children?.[0]?.children?.[0]?.kind).toBe("record");
    expect(nodes[0]?.children?.[0]?.children?.[0]?.children?.[0]?.kind).toBe(
      "field",
    );
  });

  it("expands all ancestors of a search hit", () => {
    const result = deriveExperimentalTreeSearch(nodes, "名称");
    expect(result.matches).toEqual(new Set(["field:one"]));
    expect(result.expandedKeys).toEqual([
      "directory:one",
      "library:one",
      "record:one",
    ]);
    expect(filterExperimentalTree(nodes, result.matches)).toMatchObject([
      {
        key: "directory:one",
        children: [{ key: "library:one", children: [{ key: "record:one" }] }],
      },
    ]);
  });

  it("models empty, loading and error states without fabricating nodes", () => {
    expect(treeStateFor([], false, null)).toBe("empty");
    expect(treeStateFor(nodes, true, null)).toBe("loading");
    expect(treeStateFor(nodes, false, "读取失败")).toBe("error");
  });

  it("reorders only sibling directory nodes in preview state", () => {
    const directories: ExperimentalUsTreeNode[] = [
      { key: "directory:one", kind: "directory", label: "采购目录" },
      { key: "directory:two", kind: "directory", label: "归档目录" },
    ];
    const result = reorderExperimentalDirectorySiblings(directories, {
      dragKey: "directory:two",
      dropKey: "directory:one",
      dropPosition: -1,
      dropToGap: true,
    });
    expect(result.moved).toBe(true);
    expect(result.nodes.map((node) => node.key)).toEqual([
      "directory:two",
      "directory:one",
    ]);
  });

  it("rejects hierarchy-changing preview drops without mutating order", () => {
    const result = reorderExperimentalDirectorySiblings(nodes, {
      dragKey: "directory:one",
      dropKey: "library:one",
      dropPosition: 0,
      dropToGap: false,
    });
    expect(result.moved).toBe(false);
    expect(result.nodes).toEqual(nodes);
  });
});
