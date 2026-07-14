import { useSyncExternalStore } from "react";

import type { Lineage } from "../data/gateway";
import type { DataObjectId, FieldCode, MemberId } from "../model/kernel";
import { pushToast, type UsToastInput } from "../primitives";

export interface LineageState {
  readonly kernelLineage: Lineage | null;
  readonly busy: boolean;
}

export interface KernelLineageSource {
  setActor(actorId: MemberId): void;
  lineage(objectId: DataObjectId, fieldCode: FieldCode): Promise<Lineage>;
}

type Listener = () => void;

export class LineageStore {
  private state: LineageState = { kernelLineage: null, busy: false };
  private readonly listeners = new Set<Listener>();
  private kernelSource: KernelLineageSource | null;
  private readonly showToast: (input: UsToastInput) => number;

  constructor(
    options: {
      readonly kernelSource?: KernelLineageSource | null;
      readonly pushToast?: (input: UsToastInput) => number;
    } = {},
  ) {
    this.kernelSource = options.kernelSource ?? null;
    this.showToast = options.pushToast ?? pushToast;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LineageState => this.state;

  setKernelSource(source: KernelLineageSource | null): void {
    this.kernelSource = source;
    if (source === null) this.reset();
  }

  reset(): void {
    this.state = { kernelLineage: null, busy: false };
    this.emit();
  }

  async refresh(
    objectId: DataObjectId,
    fieldCode: FieldCode,
    actor: MemberId,
  ): Promise<void> {
    if (!this.kernelSource || this.state.busy) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, busy: true };
    this.emit();
    try {
      const kernelLineage = await this.kernelSource.lineage(
        objectId,
        fieldCode,
      );
      this.state = { kernelLineage, busy: false };
      this.emit();
    } catch (error) {
      this.state = { ...this.state, busy: false };
      this.emit();
      this.showToast({
        title: "血缘同步失败",
        desc: errorMessage(error),
      });
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const lineageStore = new LineageStore();

export function useLineageSnapshot(): LineageState {
  return useSyncExternalStore(
    lineageStore.subscribe,
    lineageStore.getSnapshot,
    lineageStore.getSnapshot,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
