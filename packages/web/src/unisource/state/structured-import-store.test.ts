import { describe, expect, it, vi } from "vitest";

import type {
  ExchangeApplyOutcome,
  ExchangeDiff,
  ExchangeFormat,
} from "../data/gateway";
import type { MemberId } from "../model/kernel";
import {
  StructuredImportStore,
  type KernelExchangeSource,
} from "./structured-import-store";

describe("StructuredImportStore", () => {
  it("keeps no-source mode inert", async () => {
    const pushToast = vi.fn();
    const store = new StructuredImportStore({ pushToast });

    await store.preview("json", "{}", "wangyun");
    await store.apply("json", "{}", "wangyun");

    expect(store.getSnapshot()).toEqual({
      preview: null,
      applyResult: null,
      busy: false,
    });
    expect(pushToast).not.toHaveBeenCalled();
  });

  it("previews exchange diff with the current actor", async () => {
    const source = new FakeExchangeSource();
    const store = new StructuredImportStore({
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.preview("json", '{"objects":[]}', "lixiao");

    expect(source.actors).toEqual(["lixiao"]);
    expect(source.previewCalls).toEqual([
      { format: "json", payload: '{"objects":[]}' },
    ]);
    expect(store.getSnapshot().preview?.summary.objectsAdded).toBe(1);
    expect(store.getSnapshot().busy).toBe(false);
  });

  it("applies exchange payload, stores result and reloads", async () => {
    const source = new FakeExchangeSource();
    const onReload = vi.fn();
    const pushToast = vi.fn();
    const store = new StructuredImportStore({
      kernelSource: source,
      onReload,
      pushToast,
    });

    await store.apply("reqif", "<REQ-IF />", "chenmo");

    expect(source.actors).toEqual(["chenmo"]);
    expect(source.applyCalls).toEqual([
      { format: "reqif", payload: "<REQ-IF />" },
    ]);
    expect(store.getSnapshot().applyResult?.applied).toEqual(["prod-new"]);
    expect(onReload).toHaveBeenCalledOnce();
    expect(pushToast).toHaveBeenCalledWith({
      title: "已导入 1, 跳过 1",
    });
  });

  it("reports preview and apply failures without throwing", async () => {
    const source = new FakeExchangeSource();
    source.failPreview = true;
    source.failApply = true;
    const pushToast = vi.fn();
    const onReload = vi.fn();
    const store = new StructuredImportStore({
      kernelSource: source,
      onReload,
      pushToast,
    });

    await expect(
      store.preview("json", "bad", "wangyun"),
    ).resolves.toBeUndefined();
    await expect(
      store.apply("json", "bad", "wangyun"),
    ).resolves.toBeUndefined();

    expect(store.getSnapshot().busy).toBe(false);
    expect(onReload).not.toHaveBeenCalled();
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "结构化导入预览失败" }),
    );
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "结构化导入失败" }),
    );
  });

  it("clears state when the kernel source is removed", async () => {
    const source = new FakeExchangeSource();
    const store = new StructuredImportStore({
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.preview("json", "{}", "wangyun");
    store.setKernelSource(null);

    expect(store.getSnapshot()).toEqual({
      preview: null,
      applyResult: null,
      busy: false,
    });
  });
});

class FakeExchangeSource implements KernelExchangeSource {
  readonly actors: MemberId[] = [];
  readonly previewCalls: { format: ExchangeFormat; payload: string }[] = [];
  readonly applyCalls: { format: ExchangeFormat; payload: string }[] = [];
  failPreview = false;
  failApply = false;

  setActor(actorId: MemberId): void {
    this.actors.push(actorId);
  }

  async exchangePreview(
    format: ExchangeFormat,
    payload: string,
  ): Promise<ExchangeDiff> {
    this.previewCalls.push({ format, payload });
    if (this.failPreview) throw new Error("preview failed");
    return exchangeDiff();
  }

  async exchangeApply(
    format: ExchangeFormat,
    payload: string,
  ): Promise<ExchangeApplyOutcome> {
    this.applyCalls.push({ format, payload });
    if (this.failApply) throw new Error("apply failed");
    return {
      diff: exchangeDiff(),
      applied: ["prod-new"],
      unapplied: [
        {
          item: "rel-bad",
          error: { code: "KERNEL-422-SCHEMA-INVALID" },
        },
      ],
    };
  }
}

function exchangeDiff(): ExchangeDiff {
  return {
    objects: {
      added: ["prod-new"],
      removed: [],
      changed: [],
    },
    relations: {
      added: [],
      removed: [],
      changed: [],
    },
    summary: {
      objectsAdded: 1,
      objectsRemoved: 0,
      objectsChanged: 0,
      relationsAdded: 0,
      relationsRemoved: 0,
      relationsChanged: 0,
    },
  };
}
