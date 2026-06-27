import { describe, expect, it } from "vitest";

import { toastToneLabel } from "./toast";

describe("toastToneLabel", () => {
  it("labels all supported toast tones", () => {
    expect(toastToneLabel("success")).toBe("成功");
    expect(toastToneLabel("error")).toBe("错误");
    expect(toastToneLabel("info")).toBe("提示");
  });
});
