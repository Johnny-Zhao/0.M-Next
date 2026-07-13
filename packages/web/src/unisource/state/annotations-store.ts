import { useSyncExternalStore } from "react";

import type { Annotation, CreateAnnotationInput } from "../data/gateway";
import type { MemberId, SelectionRef } from "../model/kernel";
import { pushToast, type UsToastInput } from "../primitives";

export interface AnnotationState {
  readonly kernelAnnotations: readonly Annotation[];
  readonly busy: boolean;
}

export interface KernelAnnotationSource {
  setActor(actorId: MemberId): void;
  listAnnotations(target?: SelectionRef): Promise<readonly Annotation[]>;
  createAnnotation(request: CreateAnnotationInput): Promise<Annotation>;
  resolveAnnotation(
    annotationId: string,
    comment?: string | null,
  ): Promise<Annotation>;
  reopenAnnotation(
    annotationId: string,
    comment?: string | null,
  ): Promise<Annotation>;
}

type Listener = () => void;

export class AnnotationsStore {
  private state: AnnotationState = { kernelAnnotations: [], busy: false };
  private readonly listeners = new Set<Listener>();
  private kernelSource: KernelAnnotationSource | null = null;
  private readonly showToast: (input: UsToastInput) => number;

  constructor(
    options: {
      readonly kernelSource?: KernelAnnotationSource | null;
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

  getSnapshot = (): AnnotationState => this.state;

  setKernelSource(source: KernelAnnotationSource | null): void {
    this.kernelSource = source;
    if (source === null) {
      this.state = { kernelAnnotations: [], busy: false };
      this.emit();
    }
  }

  async refresh(
    target: SelectionRef | undefined,
    actor: MemberId,
  ): Promise<void> {
    if (!this.kernelSource) return;
    if (!target) {
      this.state = { kernelAnnotations: [], busy: false };
      this.emit();
      return;
    }
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, busy: true };
    this.emit();
    try {
      const kernelAnnotations = await this.kernelSource.listAnnotations(target);
      this.state = { kernelAnnotations, busy: false };
      this.emit();
    } catch (error) {
      this.state = { ...this.state, busy: false };
      this.emit();
      this.showToast({
        title: "批注同步失败",
        desc: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async create(request: CreateAnnotationInput, actor: MemberId): Promise<void> {
    if (!this.kernelSource) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, busy: true };
    this.emit();
    try {
      await this.kernelSource.createAnnotation(request);
      const kernelAnnotations = await this.kernelSource.listAnnotations(
        request.target,
      );
      this.state = { kernelAnnotations, busy: false };
      this.emit();
      this.showToast({ title: "批注已创建" });
    } catch (error) {
      this.state = { ...this.state, busy: false };
      this.emit();
      this.showToast({
        title: "批注创建失败",
        desc: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async resolve(
    annotationId: string,
    target: SelectionRef | undefined,
    actor: MemberId,
  ): Promise<void> {
    await this.transition("resolve", annotationId, target, actor);
  }

  async reopen(
    annotationId: string,
    target: SelectionRef | undefined,
    actor: MemberId,
  ): Promise<void> {
    await this.transition("reopen", annotationId, target, actor);
  }

  private async transition(
    action: "resolve" | "reopen",
    annotationId: string,
    target: SelectionRef | undefined,
    actor: MemberId,
  ): Promise<void> {
    if (!this.kernelSource) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, busy: true };
    this.emit();
    try {
      if (action === "resolve") {
        await this.kernelSource.resolveAnnotation(annotationId);
      } else {
        await this.kernelSource.reopenAnnotation(annotationId);
      }
      const kernelAnnotations = target
        ? await this.kernelSource.listAnnotations(target)
        : this.state.kernelAnnotations;
      this.state = { kernelAnnotations, busy: false };
      this.emit();
      this.showToast({
        title: action === "resolve" ? "批注已解决" : "批注已重开",
      });
    } catch (error) {
      this.state = { ...this.state, busy: false };
      this.emit();
      this.showToast({
        title: action === "resolve" ? "解决批注失败" : "重开批注失败",
        desc: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const annotationsStore = new AnnotationsStore();

export function useAnnotationsSnapshot(): AnnotationState {
  return useSyncExternalStore(
    annotationsStore.subscribe,
    annotationsStore.getSnapshot,
    annotationsStore.getSnapshot,
  );
}
