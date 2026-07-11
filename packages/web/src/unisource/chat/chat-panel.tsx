import { useState } from "react";

import { IconSpark, UsButton, UsMonoTag, pushToast } from "../primitives";
import { chatStore, useChatSnapshot } from "../state/chat-store";
import { sessionStore } from "../state/session-store";
import { ActionCardView } from "./action-card";

export function ChatPanel({ onClose }: { readonly onClose?: () => void }) {
  const chat = useChatSnapshot();
  const [draft, setDraft] = useState("");
  const cards = new Map(chat.actionCards.map((card) => [card.id, card]));
  const send = () => {
    chatStore.send(draft, sessionStore);
    setDraft("");
  };

  return (
    <aside className="us-chat">
      <header>
        <span>
          <IconSpark size={14} />
          <strong>同源 AI</strong>
          <UsMonoTag>COPILOT</UsMonoTag>
        </span>
        <small>上下文:本表达 + 2 数据源</small>
        {onClose ? (
          <button onClick={onClose} type="button">
            ×
          </button>
        ) : null}
      </header>
      <div className="us-chat__messages">
        {chat.messages.map((message) => (
          <article
            className="us-chatmsg"
            data-role={message.role}
            key={message.id}
          >
            <p>{message.text}</p>
            {message.actionCardIds?.map((id) => {
              const card = cards.get(id);
              return card ? <ActionCardView card={card} key={id} /> : null;
            })}
            {message.actionCardIds && message.actionCardIds.length > 0 ? (
              <footer>
                <UsButton size="sm" variant="secondary">
                  保留
                </UsButton>
                <UsButton
                  onClick={() => chatStore.undoAll(message.id)}
                  size="sm"
                  variant="danger"
                >
                  撤销全部
                </UsButton>
                <UsButton
                  onClick={() => pushToast({ title: "P2 提供 diff 视图" })}
                  size="sm"
                  variant="ghost"
                >
                  查看 diff
                </UsButton>
              </footer>
            ) : null}
          </article>
        ))}
        {chat.typing ? <div className="us-chattyping">AI 正在输入…</div> : null}
      </div>
      <div className="us-chat__suggestions">
        {["按主机/配件拆分", "把柱图改成占比"].map((item) => (
          <button key={item} onClick={() => setDraft(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <label className="us-chatinput">
        <input
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
          placeholder="说点什么,改数据或改看板…"
          value={draft}
        />
        <button onClick={send} type="button">
          发送
        </button>
      </label>
    </aside>
  );
}
