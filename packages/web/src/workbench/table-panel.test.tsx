import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: null as null | {
    readonly autoCheckAfterSave: () => Promise<void>;
    readonly commandClient: unknown;
    readonly objectType: string;
    readonly reportError: (message: string) => void;
    readonly selection: unknown;
    readonly viewClient: unknown;
    readonly workspaceId: string;
  },
  tableProps: null as null | { readonly onSaved?: () => void },
}));

vi.mock("./workbench", () => ({
  useWorkbenchContext: () => mocks.context,
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
      reportError: vi.fn(),
      selection: {},
      viewClient: {},
      workspaceId: "workspace-1",
    };

    renderToStaticMarkup(<TablePanel />);
    mocks.tableProps?.onSaved?.();

    expect(autoCheckAfterSave).toHaveBeenCalledTimes(1);
  });
});
