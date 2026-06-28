import { describe, expect, it } from "vitest";

import type { ExchangeDiffResult } from "@m-next/views";

import { exchangeFilename, exchangeSummaryItems } from "./exchange-panel";

const emptyDiff: ExchangeDiffResult = {
  objects: { added: [], removed: [], changed: [] },
  relations: { added: [], removed: [], changed: [] },
  summary: {
    objectsAdded: 2,
    objectsRemoved: 1,
    objectsChanged: 3,
    relationsAdded: 4,
    relationsRemoved: 0,
    relationsChanged: 5,
  },
};

describe("ExchangePanel helpers", () => {
  it("maps exchange diff summary counts for display", () => {
    expect(exchangeSummaryItems(emptyDiff)).toEqual([
      { label: "对象新增", value: 2, tone: "add" },
      { label: "对象变更", value: 3, tone: "change" },
      { label: "对象删除", value: 1, tone: "remove" },
      { label: "关系新增", value: 4, tone: "add" },
      { label: "关系变更", value: 5, tone: "change" },
      { label: "关系删除", value: 0, tone: "remove" },
    ]);
  });

  it("uses exchange format extensions for downloads", () => {
    expect(exchangeFilename("ws-1", "json")).toBe("mnext-ws-1.json");
    expect(exchangeFilename("ws-1", "reqif")).toBe("mnext-ws-1.reqif");
  });
});
