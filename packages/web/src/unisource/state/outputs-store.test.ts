import { describe, expect, it, vi } from "vitest";

import type {
  OutputArtifact,
  OutputCreateOptions,
  OutputFormat,
  SnapshotArtifact,
} from "../data/gateway";
import type { MemberId } from "../model/kernel";
import {
  OutputsStore,
  type KernelOutputSource,
  type OutputDownloadPayload,
} from "./outputs-store";

describe("OutputsStore", () => {
  it("exports through kernel snapshot, output and artifact endpoints", async () => {
    const source = new FakeOutputSource("ZG9jeA==");
    const downloads: OutputDownloadPayload[] = [];
    const pushToast = vi.fn();
    const store = new OutputsStore({
      kernelSource: source,
      pushToast,
      download: (payload) => downloads.push(payload),
    });

    await store.exportToKernel(
      "docx",
      {
        scopeObjectType: "hardware_products",
        objectType: "hardware_products",
        templateId: "tpl-install-v1",
        fileBaseName: "配置单:Z890",
      },
      "wangyun",
    );

    expect(source.actorIds).toEqual(["wangyun"]);
    expect(source.calls).toEqual([
      "capture:hardware_products",
      "create:snapshot-1:docx:tpl-install-v1:hardware_products",
      "get:output-1",
    ]);
    expect(downloads[0]?.filename).toBe("配置单-Z890.docx");
    expect(await downloads[0]?.blob.text()).toBe("docx");
    expect(store.getSnapshot()).toMatchObject({
      busy: false,
      lastOutput: { outputId: "output-1", format: "docx" },
    });
    expect(pushToast).toHaveBeenCalledWith({ title: "已导出 docx" });
  });

  it("downloads text artifacts without base64 decoding", async () => {
    const source = new FakeOutputSource("# Markdown", "markdown");
    const downloads: OutputDownloadPayload[] = [];
    const store = new OutputsStore({
      kernelSource: source,
      pushToast: vi.fn(),
      download: (payload) => downloads.push(payload),
    });

    await store.exportToKernel(
      "markdown",
      { fileBaseName: "配置单" },
      "lixiao",
    );

    expect(downloads[0]?.filename).toBe("配置单.md");
    expect(await downloads[0]?.blob.text()).toBe("# Markdown");
  });

  it("captures a bounded tree scope and forwards the snapshot-only mapping", async () => {
    const source = new FakeOutputSource("ZG9jeA==");
    const store = new OutputsStore({
      kernelSource: source,
      pushToast: vi.fn(),
    });

    await store.exportToKernel(
      "docx",
      {
        treeScope: {
          rootId: "plan-1",
          relationType: "contains",
          relatedRelationTypes: ["uses_quote"],
        },
        sectionMapping: { fieldLabels: { name: "名称" } },
      },
      "wangyun",
    );

    expect(source.captureArgs).toEqual([
      null,
      {
        rootId: "plan-1",
        relationType: "contains",
        relatedRelationTypes: ["uses_quote"],
      },
    ]);
    expect(source.outputOptions?.sectionMapping).toEqual({
      fieldLabels: { name: "名称" },
    });
  });

  it("does nothing without a kernel source", async () => {
    const pushToast = vi.fn();
    const download = vi.fn();
    const store = new OutputsStore({ pushToast, download });

    await store.exportToKernel("csv", {}, "wangyun");

    expect(store.getSnapshot()).toEqual({ busy: false, lastOutput: null });
    expect(pushToast).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps failures local and resets busy", async () => {
    const source = new FakeOutputSource("csv");
    source.failCapture = true;
    const pushToast = vi.fn();
    const store = new OutputsStore({ kernelSource: source, pushToast });

    await expect(
      store.exportToKernel("csv", {}, "chenmo"),
    ).resolves.toBeUndefined();

    expect(store.getSnapshot()).toEqual({ busy: false, lastOutput: null });
    expect(pushToast).toHaveBeenCalledWith({
      title: "导出失败",
      desc: "capture failed",
    });
  });
});

class FakeOutputSource implements KernelOutputSource {
  readonly actorIds: MemberId[] = [];
  readonly calls: string[] = [];
  failCapture = false;
  captureArgs: readonly unknown[] | null = null;
  outputOptions: OutputCreateOptions | null = null;

  constructor(
    private readonly artifact: string,
    private readonly artifactFormat: OutputFormat = "docx",
  ) {}

  setActor(actorId: MemberId): void {
    this.actorIds.push(actorId);
  }

  async captureSnapshot(
    scopeObjectType?: string | null,
    treeScope?: import("../data/gateway").SnapshotTreeScope | null,
  ): Promise<SnapshotArtifact> {
    if (this.failCapture) throw new Error("capture failed");
    this.captureArgs = [scopeObjectType ?? null, treeScope ?? null];
    this.calls.push(`capture:${scopeObjectType ?? "all"}`);
    return {
      snapshotId: "snapshot-1",
      createdBy: "wangyun",
      createdAt: "2026-07-10T10:24:00+08:00",
      dataVersion: 7,
      contentHash: "snapshot",
      scopeObjectType: scopeObjectType ?? null,
    };
  }

  async createOutput(
    snapshotId: string,
    format: OutputFormat,
    options: OutputCreateOptions = {},
  ): Promise<{ readonly outputId: string }> {
    this.outputOptions = options;
    this.calls.push(
      `create:${snapshotId}:${format}:${options.templateId ?? "none"}:${options.objectType ?? "all"}`,
    );
    return { outputId: "output-1" };
  }

  async getOutput(outputId: string): Promise<OutputArtifact> {
    this.calls.push(`get:${outputId}`);
    return {
      outputId,
      snapshotId: "snapshot-1",
      format: this.artifactFormat,
      artifact: this.artifact,
      createdBy: "wangyun",
      createdAt: "2026-07-10T10:25:00+08:00",
      contentHash: "output",
    };
  }
}
