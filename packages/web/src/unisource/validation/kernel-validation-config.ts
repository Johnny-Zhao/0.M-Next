export interface KernelValidationPanelConfig {
  readonly objectTypeCode: string | null;
  readonly position: "bottom";
  readonly allowManualRun: boolean;
  readonly scopeCanvasViewId?: string;
}
