import { describe, expect, it } from "vitest";

import { chatStore } from "./chat-store";
import { changeSetStore } from "./changeset-store";
import { resetDemo } from "./demo-reset";
import { sessionStore } from "./session-store";
import { validationStore } from "./validation-store";
import { workspaceStore } from "./workspace-store";

describe("resetDemo", () => {
  it("is idempotent across the UniSource demo stores", () => {
    workspaceStore.updateField("sales-offline-dealer", "cached_price", 1199, {
      actor: "wangyun",
    });
    sessionStore.switchMember("chenmo");
    chatStore.send("客单价");
    changeSetStore.reject("changeset-manual-channel");
    validationStore.ignore("XSRC-001", "wangyun");

    resetDemo();
    const first = {
      member: sessionStore.getSnapshot().currentMemberId,
      price: workspaceStore.getObject("sales-offline-dealer")?.fields
        .cached_price?.value,
      pending: changeSetStore.getPending().length,
      ignored: validationStore.getSnapshot().ignored.size,
      chatCount: chatStore.getSnapshot().messages.length,
    };
    resetDemo();

    expect(first).toEqual({
      member: "wangyun",
      price: 1299,
      pending: 2,
      ignored: 0,
      chatCount: 1,
    });
    expect({
      member: sessionStore.getSnapshot().currentMemberId,
      price: workspaceStore.getObject("sales-offline-dealer")?.fields
        .cached_price?.value,
      pending: changeSetStore.getPending().length,
      ignored: validationStore.getSnapshot().ignored.size,
      chatCount: chatStore.getSnapshot().messages.length,
    }).toEqual(first);
  });
});
