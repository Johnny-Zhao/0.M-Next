import { useEffect, useRef, useState } from "react";

import type { MemberId } from "../model/kernel";
import { UsAvatar } from "../primitives";
import { resetDemo } from "../state/demo-reset";
import { sessionStore, useSessionSnapshot } from "../state/session-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";

export function RoleSwitcher() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const session = useSessionSnapshot();
  const snapshot = useWorkspaceSnapshot();
  const current =
    snapshot.members.find((member) => member.id === session.currentMemberId) ??
    snapshot.members[0];
  const humanMembers = snapshot.members.filter(
    (
      member,
    ): member is typeof member & {
      readonly id: Exclude<MemberId, "ai">;
    } => member.id !== "ai",
  );
  const ai = snapshot.members.find((member) => member.id === "ai");

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div className="us-rolesw" ref={rootRef}>
      <button
        aria-expanded={open}
        className="us-rolesw__button"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <UsAvatar
          label={current.name.slice(0, 1)}
          member={current.avatar}
          size="sm"
          title={current.name}
        />
        <span>{current.name}</span>
      </button>
      {open ? (
        <div className="us-rolesw__menu" role="menu">
          {humanMembers.map((member) => (
            <button
              aria-pressed={member.id === session.currentMemberId}
              key={member.id}
              onClick={() => {
                sessionStore.switchMember(member.id);
                setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              <UsAvatar
                label={member.name.slice(0, 1)}
                member={member.avatar}
                size="sm"
              />
              <span>
                <strong>{member.name}</strong>
                <small>{member.role}</small>
              </span>
            </button>
          ))}
          {ai ? (
            <div className="us-rolesw__ai">
              <UsAvatar label="AI" member={ai.avatar} size="sm" />
              <span>同源 AI 跟随当前发起人权限</span>
            </div>
          ) : null}
          <button
            className="us-rolesw__reset"
            onClick={() => {
              resetDemo();
              setOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            重置演示数据
          </button>
        </div>
      ) : null}
    </div>
  );
}
