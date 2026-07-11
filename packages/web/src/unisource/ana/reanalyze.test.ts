import { afterEach, describe, expect, it, vi } from "vitest";

import { ANA_REANALYZE_DELAY_MS, scheduleAnaReanalysis } from "./reanalyze";

describe("scheduleAnaReanalysis", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the skeleton up for 800ms before replaying the fixed report", () => {
    vi.useFakeTimers();
    const setAnalyzing = vi.fn();
    const onDone = vi.fn();

    scheduleAnaReanalysis({ setAnalyzing, onDone });
    vi.advanceTimersByTime(ANA_REANALYZE_DELAY_MS - 1);

    expect(setAnalyzing).toHaveBeenCalledWith(true);
    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(setAnalyzing).toHaveBeenLastCalledWith(false);
    expect(onDone).toHaveBeenCalledOnce();
  });
});
