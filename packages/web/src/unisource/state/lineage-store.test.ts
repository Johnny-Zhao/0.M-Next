import { describe, expect, it, vi } from "vitest";

import type { Lineage } from "../data/gateway";
import type { DataObjectId, FieldCode, MemberId } from "../model/kernel";
import { LineageStore, type KernelLineageSource } from "./lineage-store";

describe("LineageStore", () => {
  it("keeps no-source mode inert", async () => {
    const pushToast = vi.fn();
    const store = new LineageStore({ pushToast });

    await store.refresh("prod-s3", "price", "wangyun");

    expect(store.getSnapshot()).toEqual({ kernelLineage: null, busy: false });
    expect(pushToast).not.toHaveBeenCalled();
  });

  it("refreshes lineage with the current actor", async () => {
    const source = new FakeLineageSource();
    const store = new LineageStore({
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.refresh("prod-s3", "price", "lixiao");

    expect(source.actors).toEqual(["lixiao"]);
    expect(source.calls).toEqual([{ objectId: "prod-s3", fieldCode: "price" }]);
    expect(store.getSnapshot().kernelLineage).toMatchObject({
      objectId: "prod-s3",
      fieldCode: "price",
      algorithm: { kind: "derived", ref: "fx.margin" },
    });
    expect(store.getSnapshot().busy).toBe(false);
  });

  it("reports failures without throwing and resets busy", async () => {
    const source = new FakeLineageSource();
    source.fail = true;
    const pushToast = vi.fn();
    const store = new LineageStore({ kernelSource: source, pushToast });

    await expect(
      store.refresh("prod-s3", "price", "wangyun"),
    ).resolves.toBeUndefined();

    expect(store.getSnapshot()).toEqual({ kernelLineage: null, busy: false });
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "血缘同步失败" }),
    );
  });

  it("clears state when the kernel source is removed", async () => {
    const source = new FakeLineageSource();
    const store = new LineageStore({
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.refresh("prod-s3", "price", "wangyun");
    store.setKernelSource(null);

    expect(store.getSnapshot()).toEqual({ kernelLineage: null, busy: false });
  });
});

class FakeLineageSource implements KernelLineageSource {
  readonly actors: MemberId[] = [];
  readonly calls: { objectId: DataObjectId; fieldCode: FieldCode }[] = [];
  fail = false;

  setActor(actorId: MemberId): void {
    this.actors.push(actorId);
  }

  async lineage(
    objectId: DataObjectId,
    fieldCode: FieldCode,
  ): Promise<Lineage> {
    this.calls.push({ objectId, fieldCode });
    if (this.fail) throw new Error("lineage failed");
    return lineage(objectId, fieldCode);
  }
}

function lineage(objectId: DataObjectId, fieldCode: FieldCode): Lineage {
  return {
    objectId,
    fieldCode,
    upstream: [
      {
        kind: "field",
        objectId: "prod-g2",
        objectType: "product_specs",
        fieldCode: "cost",
        ref: null,
        source: "manual",
        updatedAt: "2026-07-10T10:24:00+08:00",
        depth: 1,
      },
    ],
    downstream: [],
    algorithm: { kind: "derived", ref: "fx.margin" },
    partial: false,
    truncated: false,
  };
}
