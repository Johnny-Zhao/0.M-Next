import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StructuredDocumentActionRegistry } from "../doc/structured-document-action-registry";
import {
  pcProcurementItemActionId,
  registerPcProcurementDocumentActions,
} from "./pc-procurement-document-actions";

describe("pc procurement document actions", () => {
  it("registers the procurement item action and renders its entry", () => {
    const registry = new StructuredDocumentActionRegistry();
    registerPcProcurementDocumentActions(registry);
    registerPcProcurementDocumentActions(registry);
    const Action = registry.resolve(pcProcurementItemActionId);

    expect(Action).not.toBeNull();
    if (!Action) throw new Error("expected procurement item action");
    const html = renderToStaticMarkup(
      createElement(Action, { rootObjectId: "plan-1" }),
    );
    expect(html).toContain("新增明细");
  });

  it("uses a namespaced action id", () => {
    expect(pcProcurementItemActionId).toBe("pc_procurement.procurement-item");
  });
});
