import { pushToast } from "../primitives";
import { chatStore } from "./chat-store";
import { changeSetStore } from "./changeset-store";
import { sessionStore } from "./session-store";
import { validationStore } from "./validation-store";
import { workspaceStore } from "./workspace-store";

export function resetDemo(): void {
  workspaceStore.reset();
  changeSetStore.reset();
  chatStore.reset();
  sessionStore.reset();
  validationStore.reset();
  pushToast({ title: "演示数据已重置" });
}
