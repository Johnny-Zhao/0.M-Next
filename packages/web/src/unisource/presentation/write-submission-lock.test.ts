import { describe, expect, it } from "vitest";

import { isWriteSubmissionLocked } from "./write-submission-lock";

describe("isWriteSubmissionLocked", () => {
  it("locks only in-flight and committed-pending form sessions", () => {
    expect(isWriteSubmissionLocked(false, false)).toBe(false);
    expect(isWriteSubmissionLocked(true, false)).toBe(true);
    expect(isWriteSubmissionLocked(false, true)).toBe(true);
  });
});
