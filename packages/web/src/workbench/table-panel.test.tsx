import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: null as null | {
    readonly autoCheckAfterSave: () => Promise<void>;
    readonly commandClient: unknown;
    readonly objectType: string;
    readonly refreshVersion: number;
    readonly reportError: (message: string) => void;
    readonly selection: unknown;
    readonly templateCode?: string | null;
    readonly viewClient: unknown;
    readonly workspaceId: string;
  },
  fieldSummaryRendered: false,
  tableProps: null as null | {
    readonly onSaved?: () => void;
    readonly refreshKey?: number;
  },
}));

vi.mock("./workbench", () => ({
  useWorkbenchContext: () => mocks.context,
}));

vi.mock("./field-summary-panel", () => ({
  FieldSummaryPanel: () => {
    mocks.fieldSummaryRendered = true;
    return null;
  },
}));

vi.mock("@m-next/views", () => ({
  TableView: (props: { readonly onSaved?: () => void }) => {
    mocks.tableProps = props;
    return null;
  },
}));

import { TablePanel } from "./table-panel";

describe("TablePanel", () => {
  it("wires table saves into the shared automatic rule check", () => {
    const autoCheckAfterSave = vi.fn().mockResolvedValue(undefined);
    mocks.context = {
      autoCheckAfterSave,
      commandClient: {},
      objectType: "module",
      refreshVersion: 7,
      reportError: vi.fn(),
      selection: {},
      templateCode: "interior_design",
      viewClient: {},
      workspaceId: "workspace-1",
    };

    renderToStaticMarkup(<TablePanel />);
    mocks.tableProps?.onSaved?.();

    expect(autoCheckAfterSave).toHaveBeenCalledTimes(1);
    expect(mocks.tableProps?.refreshKey).toBe(7);
  });

  it("uses the field summary table for technical proposal workspaces", () => {
    mocks.tableProps = null;
    mocks.fieldSummaryRendered = false;
    mocks.context = {
      autoCheckAfterSave: vi.fn().mockResolvedValue(undefined),
      commandClient: {},
      objectType: "module",
      refreshVersion: 2,
      reportError: vi.fn(),
      selection: {},
      templateCode: "technical_proposal",
      viewClient: {},
      workspaceId: "workspace-1",
    };

    renderToStaticMarkup(<TablePanel />);

    expect(mocks.fieldSummaryRendered).toBe(true);
    expect(mocks.tableProps).toBeNull();
  });
});
