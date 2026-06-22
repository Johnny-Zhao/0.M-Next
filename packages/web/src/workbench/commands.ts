import type {
  CommandClient,
  ObjectDetail,
  SelectionCoordinator,
  ViewClient,
  ViewObject,
} from "@m-next/views";

export type CommandGroup = "定位" | "编辑" | "视图" | "分析";
export type CommandPanelId = "diagram" | "tree" | "inspector";

export interface CommandExecution {
  readonly query: string;
}

export interface CommandContext {
  readonly workspaceId: string;
  readonly objectType: string;
  readonly viewClient: Pick<ViewClient, "object" | "objects">;
  readonly commandClient: Pick<CommandClient, "updateFields">;
  readonly selection: Pick<SelectionCoordinator, "current" | "select">;
  readonly activatePanel: (panelId: CommandPanelId) => void;
  readonly openPanel: (panelId: CommandPanelId) => void;
  readonly setRootId: (value: string) => void;
  readonly refreshViews: () => void;
}

export interface CommandDefinition {
  readonly id: string;
  readonly title: string;
  readonly group: CommandGroup;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly available?: (context: CommandContext) => boolean;
  readonly run: (
    context: CommandContext,
    execution: CommandExecution,
  ) => Promise<void> | void;
}

export class CommandRegistry {
  constructor(
    readonly commands: readonly CommandDefinition[] = builtInCommands,
  ) {}

  addCommand(command: CommandDefinition): CommandRegistry {
    return new CommandRegistry([...this.commands, command]);
  }
}

export async function resolveCommandItems(
  registry: CommandRegistry,
  context: CommandContext,
  query: string,
): Promise<readonly CommandDefinition[]> {
  const staticCommands = registry.commands.filter(
    (command) =>
      (command.available?.(context) ?? true) && matchesCommand(command, query),
  );
  const objectCommands = await objectSearchCommands(context, query);
  return [...objectCommands, ...staticCommands];
}

export function matchesCommand(
  command: CommandDefinition,
  query: string,
): boolean {
  const normalized = normalize(query);
  if (!normalized) return true;
  return commandSearchText(command).includes(normalized);
}

export function groupCommandItems(
  commands: readonly CommandDefinition[],
): readonly [CommandGroup, readonly CommandDefinition[]][] {
  const groups = new Map<CommandGroup, CommandDefinition[]>();
  commands.forEach((command) => {
    const items = groups.get(command.group) ?? [];
    items.push(command);
    groups.set(command.group, items);
  });
  return [...groups.entries()];
}

async function objectSearchCommands(
  context: CommandContext,
  query: string,
): Promise<readonly CommandDefinition[]> {
  const normalized = normalize(query);
  if (!normalized) return [];
  const page = await context.viewClient.objects(
    context.workspaceId,
    context.objectType,
    0,
    50,
  );
  return page.items
    .filter((object) => objectMatches(object, normalized))
    .slice(0, 8)
    .map((object) => objectToGoToCommand(object));
}

function objectToGoToCommand(object: ViewObject): CommandDefinition {
  const title = objectTitle(object);
  return {
    id: `go-to-object:${object.objectId}`,
    title: `定位 ${title}`,
    group: "定位",
    description: `${object.objectType} · ${object.objectId}`,
    keywords: [object.objectId, object.objectType, title],
    run: (context) => {
      context.selection.select({
        entityType: "object",
        entityId: object.objectId,
      });
      context.setRootId(object.objectId);
      context.activatePanel("diagram");
    },
  };
}

function objectMatches(object: ViewObject, normalized: string): boolean {
  return objectSearchValues(object).some((value) =>
    normalize(value).includes(normalized),
  );
}

function objectSearchValues(object: ViewObject): readonly string[] {
  const fields = object.fields;
  return [
    object.objectId,
    object.objectType,
    stringField(fields.name),
    stringField(fields.title),
    stringField(fields.code),
  ].filter((value) => value.length > 0);
}

function objectTitle(object: ViewObject): string {
  return (
    stringField(object.fields.name) ||
    stringField(object.fields.title) ||
    object.objectId
  );
}

function commandSearchText(command: CommandDefinition): string {
  return normalize(
    [command.title, command.description, ...(command.keywords ?? [])].join(" "),
  );
}

function stringField(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function selectedObjectId(context: CommandContext): string | null {
  const selection = context.selection.current();
  return selection?.entityType === "object" ? selection.entityId : null;
}

async function selectedObject(
  context: CommandContext,
): Promise<ObjectDetail | null> {
  const objectId = selectedObjectId(context);
  if (!objectId) return null;
  return context.viewClient.object(context.workspaceId, objectId);
}

const builtInCommands: readonly CommandDefinition[] = [
  {
    id: "edit-update-selected-name",
    title: "改字段:保存当前对象名称",
    group: "编辑",
    description: "经 CommandClient 保存当前选中对象的 name 字段",
    keywords: ["写命令", "updatefields", "commandclient", "name"],
    available: (context) => selectedObjectId(context) !== null,
    run: async (context) => {
      const detail = await selectedObject(context);
      if (!detail) return;
      const currentName = stringField(detail.object.fields.name);
      await context.commandClient.updateFields(
        context.workspaceId,
        detail.object.objectId,
        detail.object.version,
        [
          {
            fieldDefCode: "name",
            value: currentName,
            expectedFieldVersion: detail.object.version,
          },
        ],
      );
      context.refreshViews();
    },
  },
  {
    id: "view-open-diagram",
    title: "切镜头:图",
    group: "视图",
    description: "激活图面板",
    keywords: ["画布", "diagram", "view"],
    run: (context) => context.activatePanel("diagram"),
  },
  {
    id: "view-open-tree",
    title: "打开面板:模型树",
    group: "视图",
    description: "打开并激活模型树面板",
    keywords: ["tree", "dockview"],
    run: (context) => context.openPanel("tree"),
  },
  {
    id: "view-open-inspector",
    title: "打开面板:属性/校验",
    group: "视图",
    description: "打开并激活属性/校验面板",
    keywords: ["inspector", "dockview"],
    run: (context) => context.openPanel("inspector"),
  },
  {
    id: "analysis-refresh-views",
    title: "刷新视图",
    group: "分析",
    description: "重新读取当前工作台读模型",
    keywords: ["reload", "sync"],
    run: (context) => context.refreshViews(),
  },
];

export const defaultCommandRegistry = new CommandRegistry();
