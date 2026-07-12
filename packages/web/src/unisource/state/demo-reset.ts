import { pushToast } from "../primitives";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import { chatStore } from "./chat-store";
import { changeSetStore } from "./changeset-store";
import { sessionStore } from "./session-store";
import { validationStore } from "./validation-store";
import { workspaceStore } from "./workspace-store";

let backendReload: (() => Promise<void>) | null = null;

export function configureBackendReload(
  reload: (() => Promise<void>) | null,
): void {
  backendReload = reload;
}

export function applyDemoSeed(
  seed: DemoSeed,
  options: { readonly toastTitle?: string } = {},
): void {
  workspaceStore.reset(seed);
  changeSetStore.reset(seed);
  chatStore.reset(seed);
  sessionStore.reset();
  validationStore.reset();
  if (options.toastTitle) pushToast({ title: options.toastTitle });
}

export function resetDemo(): void {
  if (backendReload) {
    void backendReload().catch((error: unknown) => {
      pushToast({
        title: "内核工作空间重载失败",
        desc: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }
  applyDemoSeed(cloneDemoSeed(), { toastTitle: "演示数据已重置" });
}
