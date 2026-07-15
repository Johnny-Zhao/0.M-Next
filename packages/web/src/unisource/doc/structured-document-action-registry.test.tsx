import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StructuredDocumentActionOutlet,
  StructuredDocumentActionRegistry,
} from "./structured-document-action-registry";

describe("StructuredDocumentActionRegistry", () => {
  it("leaves documents without an action unchanged", () => {
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentActionOutlet, {
        actionId: undefined,
        rootObjectId: "root-1",
      }),
    );

    expect(html).toBe("");
  });

  it("shows an unavailable state for an unregistered action", () => {
    const html = renderToStaticMarkup(
      createElement(StructuredDocumentActionOutlet, {
        actionId: "not-registered",
        registry: new StructuredDocumentActionRegistry(),
        rootObjectId: "root-1",
      }),
    );

    expect(html).toContain("此文档动作当前不可用");
  });

  it("allows registering the same action component more than once", () => {
    const registry = new StructuredDocumentActionRegistry();
    registry.register("plugin.action", FirstAction);

    expect(() => registry.register("plugin.action", FirstAction)).not.toThrow();
    expect(registry.resolve("plugin.action")).toBe(FirstAction);
  });

  it("rejects a different component that tries to replace an action id", () => {
    const registry = new StructuredDocumentActionRegistry();
    registry.register("plugin.action", FirstAction);

    expect(() => registry.register("plugin.action", SecondAction)).toThrow(
      "不能覆盖",
    );
    expect(registry.resolve("plugin.action")).toBe(FirstAction);
  });

  it("keeps actions from separate namespaces available together", () => {
    const registry = new StructuredDocumentActionRegistry();
    registry.register("plugin_a.create", FirstAction);
    registry.register("plugin_b.create", SecondAction);

    expect(registry.resolve("plugin_a.create")).toBe(FirstAction);
    expect(registry.resolve("plugin_b.create")).toBe(SecondAction);
  });
});

function FirstAction() {
  return null;
}

function SecondAction() {
  return null;
}
