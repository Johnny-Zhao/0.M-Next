import type { ViewObject } from "@m-next/views";

export interface ClipboardObject {
  readonly objectType: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface DiagramClipboard {
  readonly objects: readonly ClipboardObject[];
}

let clipboard: DiagramClipboard | null = null;

export function copyObjectsToClipboard(
  objects: readonly ViewObject[],
): DiagramClipboard {
  clipboard = {
    objects: objects.map((object) => ({
      objectType: object.objectType,
      fields: { ...object.fields },
    })),
  };
  return clipboard;
}

export function readDiagramClipboard(): DiagramClipboard | null {
  return clipboard;
}

export function hasDiagramClipboard(): boolean {
  return clipboard !== null && clipboard.objects.length > 0;
}

export function clearDiagramClipboard(): void {
  clipboard = null;
}
