import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  UsAvatar,
  UsAvatarGroup,
  UsBreadcrumb,
  UsButton,
  UsSyncDot,
  IconSpark,
  cx,
  type UsCrumb,
  type UsMember,
  type UsSyncState,
} from "../primitives";
import { UsLogo } from "./logo";
import { ShareDialog } from "./share-dialog";
import { useValidationSnapshot } from "../state/validation-store";

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
  aiHref,
  shareDisabledReason,
  className,
}: {
  variant?: "workspace" | "full";
  breadcrumb: UsCrumb[];
  breadcrumbTail?: ReactNode;
  sync?: { state: UsSyncState; label: ReactNode };
  people?: HeaderPerson[];
  actions?: ReactNode;
  aiHref?: string;
  shareDisabledReason?: string | null;
  className?: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const validation = useValidationSnapshot();
  const derivedShareReason =
    shareDisabledReason ??
    (validation.results.some(
      (result) =>
        result.level === "error" && !validation.ignored.has(result.ruleCode),
    )
      ? "存在校验错误,修复后可分享"
      : null);
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
        {aiHref ? (
          <Link className="us-topbar__ai" to={aiHref} title="打开同源 AI">
            <IconSpark size={13} />
          </Link>
        ) : null}
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
        {actions}
        <UsButton
          disabled={Boolean(derivedShareReason)}
          onClick={() => setShareOpen(true)}
          size="sm"
          title={derivedShareReason ?? "分享 Share"}
          variant="primary"
        >
          分享 Share
        </UsButton>
      </span>
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </header>
  );
}
