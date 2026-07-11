export const ANA_REANALYZE_DELAY_MS = 800;

export function scheduleAnaReanalysis(params: {
  readonly setAnalyzing: (value: boolean) => void;
  readonly onDone: () => void;
}): ReturnType<typeof setTimeout> {
  params.setAnalyzing(true);
  return globalThis.setTimeout(() => {
    params.setAnalyzing(false);
    params.onDone();
  }, ANA_REANALYZE_DELAY_MS);
}
