import type { CommandClient, ViewObject } from "@m-next/views";

export type DiagramShortcut =
  | "clearSelection"
  | "copy"
  | "delete"
  | "duplicate"
  | "paste"
  | "selectAll";

export type KeyboardLikeEvent = Pick<
  KeyboardEvent,
  "code" | "ctrlKey" | "key" | "metaKey" | "target"
>;

export function diagramShortcutFromEvent(
  event: KeyboardLikeEvent,
): DiagramShortcut | null {
  if (isEditableTarget(event.target)) return null;
  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.key === "Escape") return "clearSelection";
  if (event.key === "Delete" || event.key === "Backspace") return "delete";
  if (!command) return null;
  if (key === "a") return "selectAll";
  if (key === "c") return "copy";
  if (key === "d") return "duplicate";
  if (key === "v") return "paste";
  return null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

type KernelCommandPost = <T>(
  commandType: string,
  workspaceId: string,
  payload: Readonly<Record<string, unknown>>,
) => Promise<T>;

export async function createObjectByCommand(
  commandClient: CommandClient,
  workspaceId: string,
  objectTypeId: string,
  fields: Readonly<Record<string, unknown>>,
  ref: string,
): Promise<void> {
  await postKernelCommand(commandClient, "CreateObject", workspaceId, {
    objectTypeId,
    fields,
    source: { type: "manual", ref },
    initialState: "DRAFT",
  });
}

export async function softDeleteObjectByCommand(
  commandClient: CommandClient,
  workspaceId: string,
  object: ViewObject,
): Promise<void> {
  await postKernelCommand(commandClient, "SoftDelete", workspaceId, {
    targetType: "object",
    targetId: object.objectId,
    reason: "diagram-delete",
    expectedVersion: object.version,
    relationPolicy: "reject",
  });
}

async function postKernelCommand<T = void>(
  commandClient: CommandClient,
  commandType: string,
  workspaceId: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<T> {
  const post = (commandClient as unknown as { post?: KernelCommandPost }).post;
  if (typeof post !== "function") {
    throw new Error("CommandClient 缺少命令投递能力");
  }
  return (await post.call(
    commandClient,
    commandType,
    workspaceId,
    payload,
  )) as T;
}
