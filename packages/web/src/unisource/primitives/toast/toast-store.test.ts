import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TOAST_DURATION_DEFAULT,
  TOAST_DURATION_WITH_ACTION,
  dismissToast,
  getToasts,
  pushToast,
  resetToastsForTest,
  subscribeToasts,
} from "./toast-store";

describe("toast-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetToastsForTest();
  });

  afterEach(() => {
    resetToastsForTest();
    vi.useRealTimers();
  });

  it("push 后可读取,写入类 5s 自动消失", () => {
    pushToast({ title: "「售价」已更新" });
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_DURATION_DEFAULT - 1);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getToasts()).toHaveLength(0);
  });

  it("含动作(撤销)的 8s 消失", () => {
    pushToast({ title: "已更新", actions: [{ label: "撤销" }] });
    vi.advanceTimersByTime(TOAST_DURATION_DEFAULT);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_DURATION_WITH_ACTION - TOAST_DURATION_DEFAULT);
    expect(getToasts()).toHaveLength(0);
  });

  it("手动 dismiss 清理定时器并通知订阅者", () => {
    const seen: number[] = [];
    const off = subscribeToasts(() => seen.push(getToasts().length));
    const id = pushToast({ title: "A", durationMs: Infinity });
    dismissToast(id);
    expect(seen).toEqual([1, 0]);
    dismissToast(id); // 幂等,不再通知
    expect(seen).toEqual([1, 0]);
    off();
  });

  it("durationMs 覆盖默认时长", () => {
    pushToast({ title: "B", durationMs: 100 });
    vi.advanceTimersByTime(100);
    expect(getToasts()).toHaveLength(0);
  });
});
