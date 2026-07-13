import { useSyncExternalStore } from "react";

import type { MemberId } from "../model/kernel";
import { pushToast, type UsToastInput } from "../primitives";
import type {
  OutputArtifact,
  OutputCreateOptions,
  OutputFormat,
  SnapshotArtifact,
} from "../data/gateway";

export interface OutputState {
  readonly busy: boolean;
  readonly lastOutput: OutputArtifact | null;
}

export interface OutputExportScope extends OutputCreateOptions {
  readonly scopeObjectType?: string | null;
  readonly fileBaseName?: string;
}

export interface OutputDownloadPayload {
  readonly filename: string;
  readonly format: OutputFormat;
  readonly blob: Blob;
  readonly output: OutputArtifact;
}

export interface KernelOutputSource {
  setActor(actorId: MemberId): void;
  captureSnapshot(scopeObjectType?: string | null): Promise<SnapshotArtifact>;
  createOutput(
    snapshotId: string,
    format: OutputFormat,
    options?: OutputCreateOptions,
  ): Promise<unknown>;
  getOutput(outputId: string): Promise<OutputArtifact>;
}

type Listener = () => void;
type OutputMetaLike = { readonly outputId?: string };

const textFormats = new Set<OutputFormat>(["markdown", "csv", "html"]);

export class OutputsStore {
  private state: OutputState = { busy: false, lastOutput: null };
  private readonly listeners = new Set<Listener>();
  private kernelSource: KernelOutputSource | null;
  private readonly showToast: (input: UsToastInput) => number;
  private readonly download: (payload: OutputDownloadPayload) => void;

  constructor(
    options: {
      readonly kernelSource?: KernelOutputSource | null;
      readonly pushToast?: (input: UsToastInput) => number;
      readonly download?: (payload: OutputDownloadPayload) => void;
    } = {},
  ) {
    this.kernelSource = options.kernelSource ?? null;
    this.showToast = options.pushToast ?? pushToast;
    this.download = options.download ?? defaultDownload;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): OutputState => this.state;

  setKernelSource(source: KernelOutputSource | null): void {
    this.kernelSource = source;
    if (source === null) this.reset();
  }

  reset(): void {
    this.state = { busy: false, lastOutput: null };
    this.emit();
  }

  async exportToKernel(
    format: OutputFormat,
    scope: OutputExportScope,
    actor: MemberId,
  ): Promise<void> {
    if (!this.kernelSource || this.state.busy) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, busy: true };
    this.emit();
    try {
      const snapshot = await this.kernelSource.captureSnapshot(
        scope.scopeObjectType ?? null,
      );
      const outputMeta = await this.kernelSource.createOutput(
        snapshot.snapshotId,
        format,
        {
          templateId: scope.templateId ?? null,
          templateVersion: scope.templateVersion ?? null,
          objectType: scope.objectType ?? null,
          fieldOrder: scope.fieldOrder ?? null,
        },
      );
      const outputId = readOutputId(outputMeta);
      const output = await this.kernelSource.getOutput(outputId);
      this.download(toDownloadPayload(output, scope.fileBaseName));
      this.state = { busy: false, lastOutput: output };
      this.emit();
      this.showToast({ title: `已导出 ${format}` });
    } catch (error) {
      this.state = { ...this.state, busy: false };
      this.emit();
      this.showToast({
        title: "导出失败",
        desc: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const outputsStore = new OutputsStore();

export function useOutputsSnapshot(): OutputState {
  return useSyncExternalStore(
    outputsStore.subscribe,
    outputsStore.getSnapshot,
    outputsStore.getSnapshot,
  );
}

function readOutputId(value: unknown): string {
  const outputId = (value as OutputMetaLike | null)?.outputId;
  if (typeof outputId !== "string" || outputId.length === 0) {
    throw new Error("内核输出未返回 outputId");
  }
  return outputId;
}

function toDownloadPayload(
  output: OutputArtifact,
  fileBaseName = "unisource-output",
): OutputDownloadPayload {
  return {
    filename: `${safeFilename(fileBaseName)}.${extensionFor(output.format)}`,
    format: output.format,
    blob: artifactBlob(output),
    output,
  };
}

function artifactBlob(output: OutputArtifact): Blob {
  const mimeType = mimeFor(output.format);
  if (textFormats.has(output.format)) {
    return new Blob([output.artifact], { type: mimeType });
  }
  return new Blob([decodeBase64(output.artifact)], { type: mimeType });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function defaultDownload(payload: OutputDownloadPayload): void {
  if (typeof document === "undefined") return;
  const createObjectURL = URL.createObjectURL.bind(URL);
  const revokeObjectURL = URL.revokeObjectURL.bind(URL);
  const url = createObjectURL(payload.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.filename;
  anchor.click();
  revokeObjectURL(url);
}

function extensionFor(format: OutputFormat): string {
  if (format === "markdown") return "md";
  return format;
}

function mimeFor(format: OutputFormat): string {
  const mimes: Record<OutputFormat, string> = {
    markdown: "text/markdown;charset=utf-8",
    csv: "text/csv;charset=utf-8",
    html: "text/html;charset=utf-8",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimes[format];
}

function safeFilename(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-") || "unisource-output";
}
