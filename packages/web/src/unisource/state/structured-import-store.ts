import { useSyncExternalStore } from "react";

import type {
  ExchangeApplyOutcome,
  ExchangeDiff,
  ExchangeFormat,
} from "../data/gateway";
import type { MemberId } from "../model/kernel";
import { pushToast, type UsToastInput } from "../primitives";

export interface StructuredImportState {
  readonly preview: ExchangeDiff | null;
  readonly applyResult: ExchangeApplyOutcome | null;
  readonly busy: boolean;
}

export interface KernelExchangeSource {
  setActor(actorId: MemberId): void;
  exchangePreview(
    format: ExchangeFormat,
    payload: string,
  ): Promise<ExchangeDiff>;
  exchangeApply(
    format: ExchangeFormat,
    payload: string,
  ): Promise<ExchangeApplyOutcome>;
}

type Listener = () => void;
type ReloadHandler = () => void | Promise<void>;

export class StructuredImportStore {
  private state: StructuredImportState = {
    preview: null,
    applyResult: null,
    busy: false,
  };
  private readonly listeners = new Set<Listener>();
  private kernelSource: KernelExchangeSource | null;
  private onReload: ReloadHandler | null;
  private readonly showToast: (input: UsToastInput) => number;

  constructor(
    options: {
      readonly kernelSource?: KernelExchangeSource | null;
      readonly onReload?: ReloadHandler | null;
      readonly pushToast?: (input: UsToastInput) => number;
    } = {},
  ) {
    this.kernelSource = options.kernelSource ?? null;
    this.onReload = options.onReload ?? null;
    this.showToast = options.pushToast ?? pushToast;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StructuredImportState => this.state;

  setKernelSource(
    source: KernelExchangeSource | null,
    onReload: ReloadHandler | null = null,
  ): void {
    this.kernelSource = source;
    this.onReload = onReload;
    if (source === null) this.reset();
  }

  reset(): void {
    this.state = { preview: null, applyResult: null, busy: false };
    this.emit();
  }

  async preview(
    format: ExchangeFormat,
    payload: string,
    actor: MemberId,
  ): Promise<void> {
    if (!this.kernelSource || this.state.busy) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, busy: true, applyResult: null };
    this.emit();
    try {
      const preview = await this.kernelSource.exchangePreview(format, payload);
      this.state = { preview, applyResult: null, busy: false };
      this.emit();
      this.showToast({ title: `预览完成 · ${totalChanges(preview)} 处变更` });
    } catch (error) {
      this.state = { ...this.state, busy: false };
      this.emit();
      this.showToast({
        title: "结构化导入预览失败",
        desc: errorMessage(error),
      });
    }
  }

  async apply(
    format: ExchangeFormat,
    payload: string,
    actor: MemberId,
  ): Promise<void> {
    if (!this.kernelSource || this.state.busy) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, busy: true };
    this.emit();
    try {
      const applyResult = await this.kernelSource.exchangeApply(
        format,
        payload,
      );
      this.state = {
        preview: applyResult.diff,
        applyResult,
        busy: false,
      };
      this.emit();
      await this.onReload?.();
      this.showToast({
        title: `已导入 ${applyResult.applied.length}, 跳过 ${applyResult.unapplied.length}`,
      });
    } catch (error) {
      this.state = { ...this.state, busy: false };
      this.emit();
      this.showToast({
        title: "结构化导入失败",
        desc: errorMessage(error),
      });
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const structuredImportStore = new StructuredImportStore();

export function useStructuredImportSnapshot(): StructuredImportState {
  return useSyncExternalStore(
    structuredImportStore.subscribe,
    structuredImportStore.getSnapshot,
    structuredImportStore.getSnapshot,
  );
}

function totalChanges(diff: ExchangeDiff): number {
  return (
    diff.summary.objectsAdded +
    diff.summary.objectsRemoved +
    diff.summary.objectsChanged +
    diff.summary.relationsAdded +
    diff.summary.relationsRemoved +
    diff.summary.relationsChanged
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
