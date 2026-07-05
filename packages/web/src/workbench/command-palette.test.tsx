import { describe, expect, it, vi } from "vitest";

import {
  executeCommand,
  isCommandPaletteShortcut,
  nextActiveIndex,
} from "./command-palette";
import {
  CommandRegistry,
  groupCommandItems,
  resolveCommandItems,
  type CommandContext,
} from "./commands";

describe("CommandPalette", () => {
  it("recognizes command palette shortcuts and wraps keyboard selection", () => {
    expect(
      isCommandPaletteShortcut({
        altKey: false,
        ctrlKey: false,
        key: "k",
        metaKey: true,
        shiftKey: false,
      }),
    ).toBe(true);
    expect(
      isCommandPaletteShortcut({
        altKey: false,
        ctrlKey: true,
        key: "K",
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
    expect(nextActiveIndex(0, 3, -1)).toBe(2);
    expect(nextActiveIndex(2, 3, 1)).toBe(0);
  });

  it("filters commands and groups visible items", async () => {
    const { context } = commandTestContext();
    const registry = new CommandRegistry([
      {
        id: "view-tree",
        title: "打开面板:模型树",
        group: "视图",
        run: vi.fn(),
      },
      {
        id: "analysis-refresh",
        title: "刷新视图",
        group: "分析",
        run: vi.fn(),
      },
    ]);
    const items = await resolveCommandItems(registry, context, "打开");

    expect(items.map((item) => item.id)).toEqual(["view-tree"]);
    expect(groupCommandItems(items)).toEqual([["视图", [items[0]]]]);
  });

  it("executes a go-to command by selecting and focusing an object", async () => {
    const { context, calls } = commandTestContext({
      objects: [
        {
          objectId: "obj-a",
          objectType: "demo_object",
          status: "DRAFT",
          version: 3,
          fields: { name: "Alpha Pump", code: "A-001" },
          updatedAt: "2026-06-21T00:00:00Z",
        },
      ],
    });
    const items = await resolveCommandItems(
      new CommandRegistry([]),
      context,
      "alpha",
    );

    await executeCommand(items[0]!, context, "alpha");

    expect(calls.objects).toHaveBeenCalledWith(
      "workspace-1",
      "demo_object",
      0,
      50,
    );
    expect(calls.select).toHaveBeenCalledWith({
      entityType: "object",
      entityId: "obj-a",
    });
    expect(calls.setRootId).toHaveBeenCalledWith("obj-a");
    expect(calls.activatePanel).toHaveBeenCalledWith("diagram");
  });

  it("executes a write command through CommandClient", async () => {
    const { context, calls } = commandTestContext({
      selectedObjectId: "obj-a",
      detailName: "Alpha Pump",
      detailVersion: 7,
    });
    const items = await resolveCommandItems(
      new CommandRegistry(),
      context,
      "改字段",
    );
    const command = items.find(
      (item) => item.id === "edit-update-selected-name",
    );

    await executeCommand(command!, context, "改字段");

    // 仅按对象版本乐观锁(version 7 = expectedObjectVersion);载荷不含 expectedFieldVersion。
    expect(calls.updateFields).toHaveBeenCalledWith("workspace-1", "obj-a", 7, [
      { fieldDefCode: "name", value: "Alpha Pump" },
    ]);
    expect(calls.refreshViews).toHaveBeenCalled();
  });

  it("executes document output commands through the workbench action", async () => {
    const { context, calls } = commandTestContext();
    const items = await resolveCommandItems(
      new CommandRegistry(),
      context,
      "markdown",
    );
    const command = items.find(
      (item) => item.id === "output-generate-markdown",
    );

    await executeCommand(command!, context, "markdown");

    expect(calls.generateOutput).toHaveBeenCalledWith("markdown");
  });

  it("returns an empty state when no commands match", async () => {
    const { context } = commandTestContext();
    const items = await resolveCommandItems(
      new CommandRegistry([]),
      context,
      "missing",
    );

    expect(items).toEqual([]);
  });

  it("allows external commands to be appended to the registry", async () => {
    const { context } = commandTestContext();
    const custom = {
      id: "custom-analysis",
      title: "追加分析命令",
      group: "分析" as const,
      run: vi.fn(),
    };
    const items = await resolveCommandItems(
      new CommandRegistry([]).addCommand(custom),
      context,
      "追加",
    );

    expect(items.map((item) => item.id)).toEqual(["custom-analysis"]);
  });
});

interface CommandContextOptions {
  readonly selectedObjectId?: string;
  readonly detailName?: string;
  readonly detailVersion?: number;
  readonly objects?: readonly {
    readonly objectId: string;
    readonly objectType: string;
    readonly status: string;
    readonly version: number;
    readonly fields: Readonly<Record<string, unknown>>;
    readonly updatedAt: string;
  }[];
}

function commandTestContext(options: CommandContextOptions = {}): {
  readonly context: CommandContext;
  readonly calls: ReturnType<typeof commandCalls>;
} {
  const calls = commandCalls();
  const selectedObjectId = options.selectedObjectId ?? null;
  const context: CommandContext = {
    workspaceId: "workspace-1",
    objectType: "demo_object",
    viewClient: {
      objects: calls.objects.mockResolvedValue({
        items: options.objects ?? [],
        page: 0,
        pageSize: 50,
        total: options.objects?.length ?? 0,
      }),
      object: calls.object.mockResolvedValue({
        object: {
          objectId: selectedObjectId ?? "obj-a",
          objectType: "demo_object",
          status: "DRAFT",
          version: options.detailVersion ?? 1,
          fields: { name: options.detailName ?? "Alpha" },
          updatedAt: "2026-06-21T00:00:00Z",
        },
        relations: [],
      }),
    },
    commandClient: {
      updateFields: calls.updateFields.mockResolvedValue(undefined),
    },
    generateOutput: calls.generateOutput.mockResolvedValue(undefined),
    selection: {
      current: calls.current.mockReturnValue(
        selectedObjectId
          ? { entityType: "object", entityId: selectedObjectId }
          : null,
      ),
      select: calls.select,
    },
    activatePanel: calls.activatePanel,
    openPanel: calls.openPanel,
    setRootId: calls.setRootId,
    refreshViews: calls.refreshViews,
  };
  return { context, calls };
}

function commandCalls() {
  return {
    activatePanel: vi.fn(),
    current: vi.fn(),
    generateOutput: vi.fn(),
    object: vi.fn(),
    objects: vi.fn(),
    openPanel: vi.fn(),
    refreshViews: vi.fn(),
    select: vi.fn(),
    setRootId: vi.fn(),
    updateFields: vi.fn(),
  };
}
