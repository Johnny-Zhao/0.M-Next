import type { ReactNode } from "react";

import {
  UsAvatar,
  UsAvatarGroup,
  UsBreadcrumb,
  UsButton,
  UsSyncDot,
  cx,
  type UsCrumb,
  type UsMember,
  type UsSyncState,
} from "../primitives";
import { UsLogo } from "./logo";

export interface HeaderPerson {
  member: UsMember;
  label: string;
  title?: string;
}

/**
 * WorkspaceHeader(交接规格 §02 AppShell/TopBar):
 * Breadcrumb + SyncDot + AvatarGroup + ShareButton。
 * variant="workspace" 48px(工作区页,配侧栏)| "full" 52px(设置/校验类全宽页,自带 Logo)。
 */
export function WorkspaceHeader({
  variant = "workspace",
  breadcrumb,
  breadcrumbTail,
  sync,
  people,
  actions,
  className,
}: {
  variant?: "workspace" | "full";
  breadcrumb: UsCrumb[];
  breadcrumbTail?: ReactNode;
  sync?: { state: UsSyncState; label: ReactNode };
  people?: HeaderPerson[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cx(
        "us-topbar",
        variant === "full" && "us-topbar--full",
        className,
      )}
    >
      {variant === "full" ? <UsLogo sub={false} /> : null}
      <UsBreadcrumb items={breadcrumb} tail={breadcrumbTail} />
      <span className="us-topbar__spacer" />
      <span className="us-topbar__actions">
        {sync ? <UsSyncDot state={sync.state}>{sync.label}</UsSyncDot> : null}
        {people && people.length > 0 ? (
          <UsAvatarGroup>
            {people.map((p) => (
              <UsAvatar
                key={p.member + p.label}
                member={p.member}
                label={p.label}
                title={p.title}
              />
            ))}
          </UsAvatarGroup>
        ) : null}
        {actions ?? (
          <UsButton variant="primary" size="sm">
            分享 Share
          </UsButton>
        )}
      </span>
    </header>
  );
}
