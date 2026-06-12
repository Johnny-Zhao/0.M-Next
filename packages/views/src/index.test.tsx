import { describe, expect, it } from "vitest";

import { ReadModelView } from "./index";

describe("ReadModelView", () => {
  it("creates a read-model element", () => {
    expect(
      ReadModelView({ model: { title: "Workspace" } }).props.children,
    ).toBe("Workspace");
  });
});
