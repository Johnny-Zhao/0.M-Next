import type { MemberId, PermissionMatrix, PermLevel } from "../model/kernel";
import type { Member } from "../model/view-layer";
import { UsAvatar } from "../primitives";
import { permissionLabel } from "./capability-list";

const resources = [
  { code: "product_specs", label: "产品规格库", icon: "▦" },
  { code: "channel_sales", label: "渠道销量表", icon: "▤" },
  { code: "exp-dashboard", label: "渠道经营看板", icon: "▥" },
  { code: "exp-spec-doc", label: "S3 规格书", icon: "▧" },
] as const;

export function PermissionMatrixView({
  members,
  permissions,
  selectedMemberId,
  onSelectMember,
}: {
  readonly members: readonly Member[];
  readonly permissions: PermissionMatrix;
  readonly selectedMemberId: MemberId;
  readonly onSelectMember: (memberId: MemberId) => void;
}) {
  const humanMembers = members.filter((member) => member.id !== "ai");
  const ai = members.find((member) => member.id === "ai");
  return (
    <section className="us-perm-matrix">
      <div className="us-perm-matrix__head">
        <span>成员</span>
        {resources.map((resource) => (
          <span key={resource.code}>
            <b>{resource.icon}</b>
            {resource.label}
          </span>
        ))}
      </div>
      {humanMembers.map((member) => (
        <button
          aria-pressed={member.id === selectedMemberId}
          className="us-perm-row"
          data-highlight={member.id === "chenmo"}
          key={member.id}
          onClick={() => onSelectMember(member.id)}
          type="button"
        >
          <span className="us-perm-person">
            <UsAvatar
              label={member.name.slice(0, 1)}
              member={member.avatar}
              size="sm"
            />
            <span>
              <strong>{member.name}</strong>
              <small>{member.dept}</small>
            </span>
          </span>
          {resources.map((resource) => {
            const level = permissions[member.id]?.[resource.code] ?? "none";
            return <PermissionBadge key={resource.code} level={level} />;
          })}
        </button>
      ))}
      {ai ? (
        <div className="us-perm-row us-perm-row--ai">
          <span className="us-perm-person">
            <UsAvatar label="AI" member={ai.avatar} size="sm" />
            <span>
              <strong>{ai.name}</strong>
              <small>{ai.dept}</small>
            </span>
          </span>
          <p>跟随发起人权限 — 越权操作自动转为待审批,不直接落库</p>
        </div>
      ) : null}
    </section>
  );
}

function PermissionBadge({ level }: { readonly level: PermLevel }) {
  return (
    <span className="us-perm-badge" data-level={level}>
      {permissionLabel(level)}
    </span>
  );
}

export { resources as permissionResources };
