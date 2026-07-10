import type { ObjectHistoryEntry } from "@m-next/views";
import { describe, expect, it } from "vitest";

import {
  formatHistoryValue,
  historyEntryText,
  historyKindMeta,
  isProvenanceMilestone,
  provenanceChain,
} from "./object-history";

function entry(patch: Partial<ObjectHistoryEntry>): ObjectHistoryEntry {
  return {
    eventId: "ev",
    seq: 1,
    kind: "edit",
    fieldCode: null,
    before: null,
    after: null,
    actorKind: "user",
    actorId: "u",
    actorDisplay: "叶工程师",
    source: "manual",
    objectVersion: 1,
    correlationId: null,
    occurredAt: "2026-06-21T00:00:00Z",
    ...patch,
  };
}

describe("historyKindMeta", () => {
  it("maps every kind to a glyph, label and tone", () => {
    expect(historyKindMeta("create").label).toBe("创建");
    expect(historyKindMeta("edit").tone).toBe("accent");
    expect(historyKindMeta("delete").tone).toBe("block");
    expect(historyKindMeta("link").glyph).toBe("⇄");
  });
});

describe("formatHistoryValue", () => {
  it("renders scalars and blanks null / objects", () => {
    expect(formatHistoryValue(5)).toBe("5");
    expect(formatHistoryValue("南")).toBe("南");
    expect(formatHistoryValue(null)).toBe("");
    expect(formatHistoryValue({ relationType: "供电" })).toBe("");
  });
});

describe("historyEntryText", () => {
  it("composes a field edit with before → after and the injected label", () => {
    const text = historyEntryText(
      entry({ kind: "edit", fieldCode: "volt", before: 26, after: 28 }),
      (code) => (code === "volt" ? "母线电压" : code),
    );
    expect(text).toBe("母线电压 26 → 28");
  });

  it("falls back to = when there is no before value", () => {
    expect(
      historyEntryText(entry({ kind: "edit", fieldCode: "cap", after: 100 })),
    ).toBe("cap = 100");
  });

  it("differentiates create by source", () => {
    expect(historyEntryText(entry({ kind: "create", source: "manual" }))).toBe(
      "创建对象",
    );
    expect(historyEntryText(entry({ kind: "create", source: "import" }))).toBe(
      "从外部导入创建",
    );
  });

  it("names the relation for link / unlink from after_val", () => {
    expect(
      historyEntryText(
        entry({ kind: "link", after: { relationType: "供电" } }),
      ),
    ).toBe("关联 供电");
    expect(historyEntryText(entry({ kind: "unlink", after: null }))).toBe(
      "解除 关系",
    );
  });
});

describe("provenance milestones", () => {
  it("keeps create / state / archive and external-source entries, drops field edits", () => {
    expect(isProvenanceMilestone(entry({ kind: "create" }))).toBe(true);
    expect(isProvenanceMilestone(entry({ kind: "state" }))).toBe(true);
    expect(
      isProvenanceMilestone(entry({ kind: "edit", source: "manual" })),
    ).toBe(false);
    expect(isProvenanceMilestone(entry({ kind: "edit", source: "AI" }))).toBe(
      true,
    );
  });

  it("orders the chain oldest → newest by seq", () => {
    const chain = provenanceChain([
      entry({ kind: "state", seq: 4 }),
      entry({ kind: "create", seq: 1 }),
      entry({ kind: "edit", seq: 2, source: "manual" }),
    ]);
    expect(chain.map((item) => item.seq)).toEqual([1, 4]);
  });
});
