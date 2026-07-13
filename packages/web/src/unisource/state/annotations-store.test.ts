import { describe, expect, it, vi } from "vitest";

import type { Annotation, CreateAnnotationInput } from "../data/gateway";
import type { MemberId, SelectionRef } from "../model/kernel";
import {
  AnnotationsStore,
  type KernelAnnotationSource,
} from "./annotations-store";

const target: SelectionRef = { entityType: "object", entityId: "prod-s3" };

describe("AnnotationsStore", () => {
  it("keeps no-source mode local-only", async () => {
    const pushToast = vi.fn();
    const store = new AnnotationsStore({ pushToast });

    await store.refresh(target, "wangyun");
    await store.create(createInput(), "wangyun");
    await store.resolve("ann-1", target, "wangyun");
    await store.reopen("ann-1", target, "wangyun");

    expect(store.getSnapshot()).toEqual({
      kernelAnnotations: [],
      busy: false,
    });
    expect(pushToast).not.toHaveBeenCalled();
  });

  it("refreshes annotations with the current actor", async () => {
    const source = new FakeAnnotationSource([annotation("ann-1")]);
    const store = new AnnotationsStore({
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.refresh(target, "lixiao");

    expect(source.actors).toEqual(["lixiao"]);
    expect(source.listCalls).toEqual([target]);
    expect(store.getSnapshot().kernelAnnotations[0]?.id).toBe("ann-1");
    expect(store.getSnapshot().busy).toBe(false);
  });

  it("clears kernel annotations when no target is selected", async () => {
    const source = new FakeAnnotationSource([annotation("ann-1")]);
    const store = new AnnotationsStore({
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.refresh(target, "wangyun");
    await store.refresh(undefined, "wangyun");

    expect(store.getSnapshot().kernelAnnotations).toEqual([]);
    expect(source.listCalls).toEqual([target]);
  });

  it("creates annotations and reloads the selected target", async () => {
    const source = new FakeAnnotationSource([annotation("ann-1")]);
    const pushToast = vi.fn();
    const store = new AnnotationsStore({ kernelSource: source, pushToast });

    await store.create(createInput(), "wangyun");

    expect(source.actors).toEqual(["wangyun"]);
    expect(source.createCalls[0]).toMatchObject({
      target,
      body: "Needs review",
      severity: "warn",
      anchoredDataVersion: 3,
    });
    expect(source.listCalls).toEqual([target]);
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("批注") }),
    );
    expect(store.getSnapshot().busy).toBe(false);
  });

  it("resolves and reopens annotations through the source", async () => {
    const source = new FakeAnnotationSource([annotation("ann-1", true)]);
    const store = new AnnotationsStore({
      kernelSource: source,
      pushToast: () => 0,
    });

    await store.resolve("ann-1", target, "chenmo");
    await store.reopen("ann-1", target, "chenmo");

    expect(source.actors).toEqual(["chenmo", "chenmo"]);
    expect(source.resolveCalls).toEqual(["ann-1"]);
    expect(source.reopenCalls).toEqual(["ann-1"]);
    expect(source.listCalls).toEqual([target, target]);
    expect(store.getSnapshot().busy).toBe(false);
  });

  it("reports refresh failures without throwing", async () => {
    const source = new FakeAnnotationSource([]);
    source.failList = true;
    const pushToast = vi.fn();
    const store = new AnnotationsStore({ kernelSource: source, pushToast });

    await expect(store.refresh(target, "wangyun")).resolves.toBeUndefined();

    expect(store.getSnapshot().busy).toBe(false);
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ desc: "list failed" }),
    );
  });

  it("reports write failures without throwing", async () => {
    const source = new FakeAnnotationSource([]);
    source.failCreate = true;
    const pushToast = vi.fn();
    const store = new AnnotationsStore({ kernelSource: source, pushToast });

    await expect(
      store.create(createInput(), "wangyun"),
    ).resolves.toBeUndefined();

    source.failCreate = false;
    source.failResolve = true;
    await expect(
      store.resolve("ann-1", target, "wangyun"),
    ).resolves.toBeUndefined();

    expect(store.getSnapshot().busy).toBe(false);
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ desc: "create failed" }),
    );
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ desc: "resolve failed" }),
    );
  });
});

class FakeAnnotationSource implements KernelAnnotationSource {
  readonly actors: MemberId[] = [];
  readonly listCalls: (SelectionRef | undefined)[] = [];
  readonly createCalls: CreateAnnotationInput[] = [];
  readonly resolveCalls: string[] = [];
  readonly reopenCalls: string[] = [];
  failList = false;
  failCreate = false;
  failResolve = false;

  constructor(private readonly annotations: readonly Annotation[]) {}

  setActor(actorId: MemberId): void {
    this.actors.push(actorId);
  }

  async listAnnotations(target?: SelectionRef): Promise<readonly Annotation[]> {
    this.listCalls.push(target);
    if (this.failList) throw new Error("list failed");
    return this.annotations;
  }

  async createAnnotation(request: CreateAnnotationInput): Promise<Annotation> {
    this.createCalls.push(request);
    if (this.failCreate) throw new Error("create failed");
    return annotation("ann-created");
  }

  async resolveAnnotation(annotationId: string): Promise<Annotation> {
    this.resolveCalls.push(annotationId);
    if (this.failResolve) throw new Error("resolve failed");
    return annotation(annotationId, true);
  }

  async reopenAnnotation(annotationId: string): Promise<Annotation> {
    this.reopenCalls.push(annotationId);
    return annotation(annotationId, false);
  }
}

function createInput(): CreateAnnotationInput {
  return {
    target,
    body: "Needs review",
    severity: "warn",
    anchoredDataVersion: 3,
  };
}

function annotation(id: string, resolved = false): Annotation {
  return {
    id,
    anchor: target,
    body: `${id} body`,
    author: "wangyun",
    at: "2026-07-10T10:24:00+08:00",
    resolved,
    severity: "warn",
    anchoredDataVersion: 3,
    resolvedBy: resolved ? "lixiao" : null,
    resolvedAt: resolved ? "2026-07-10T10:30:00+08:00" : null,
  };
}
