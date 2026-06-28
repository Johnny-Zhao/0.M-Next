import { describe, expect, it } from "vitest";

import type { ExchangeDiffResult, SnapshotMeta } from "@m-next/views";

import { snapshotDiffSummaryItems, snapshotTitle } from "./snapshot-panel";

const diff: ExchangeDiffResult = {
  objects: { added: ["old-only"], removed: ["new-only"], changed: [] },
  relations: { added: ["rel-old"], removed: ["rel-new"], changed: [] },
  summary: {
    objectsAdded: 1,
    objectsRemoved: 2,
    objectsChanged: 3,
    relationsAdded: 4,
    relationsRemoved: 5,
    relationsChanged: 6,
  },
};

describe("SnapshotPanel helpers", () => {
  it("reverses current-to-snapshot summaries for snapshot-to-current display", () => {
    expect(snapshotDiffSummaryItems(diff, true)).toEqual([
      { label: "对象新增", value: 2, tone: "add" },
      { label: "对象变更", value: 3, tone: "change" },
      { label: "对象删除", value: 1, tone: "remove" },
      { label: "关系新增", value: 5, tone: "add" },
      { label: "关系变更", value: 6, tone: "change" },
      { label: "关系删除", value: 4, tone: "remove" },
    ]);
  });

  it("keeps snapshot-to-snapshot summaries in request direction", () => {
    expect(snapshotDiffSummaryItems(diff, false)[0]).toEqual({
      label: "对象新增",
      value: 1,
      tone: "add",
    });
  });

  it("formats snapshot titles with data version", () => {
    const snapshot: SnapshotMeta = {
      snapshotId: "snap-1",
      createdAt: "2026-06-28T00:00:00Z",
      createdBy: "actor",
      dataVersion: 42,
      contentHash: "hash",
      scopeObjectType: null,
    };

    expect(snapshotTitle(snapshot)).toContain("v42");
  });
});
