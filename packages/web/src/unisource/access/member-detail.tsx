import type { MemberId, PermissionMatrix } from "../model/kernel";
import type { Member } from "../model/view-layer";
import { UsAvatar, UsMonoTag } from "../primitives";
import { deriveCapabilities, permissionLabel } from "./capability-list";
import { permissionResources } from "./permission-matrix";
import { projectSpaceRole, SPACE_ROLE_LABEL } from "./space-role";

export function MemberDetail({
  member,
  permissions,
}: {
  readonly member: Member;
  readonly permissions: PermissionMatrix;
}) {
  const resource = permissionResources[0];
  const level = permissions[member.id as MemberId]?.[resource.code] ?? "none";
  const viewResource =
    permissionResources.find(
      (candidate) => candidate.code === "exp-dashboard",
    ) ??
    permissionResources[2] ??
    resource;
  const viewLevel =
    permissions[member.id as MemberId]?.[viewResource.code] ?? "none";
  const role = projectSpaceRole(member.id as MemberId, permissions);
  const capabilities = deriveCapabilities(level);
  return (
    <section className="us-memberdetail">
      <header>
        <UsAvatar
          label={member.name.slice(0, 1)}
          member={member.avatar}
          size="md"
        />
        <div>
          <strong>{member.name}</strong>
          <UsMonoTag>
            {member.dept} · {member.email}
          </UsMonoTag>
          <UsMonoTag active={role === "ADMIN"}>
            {role} · {SPACE_ROLE_LABEL[role]}
          </UsMonoTag>
        </div>
      </header>
      <div className="us-memberdetail__scope">
        <span>数据权限:{permissionLabel(level)}</span>
        <span>表达权限:{permissionLabel(viewLevel)}</span>
        {member.id === "chenmo" ? <span>数据只读 + 表达可编</span> : null}
      </div>
      <h3>
        能力明细 · {resource.label}({permissionLabel(level)})
      </h3>
      <ul className="us-capability-list">
        {capabilities.map((capability) => (
          <li data-allowed={capability.allowed} key={capability.label}>
            <span>{capability.allowed ? "✓" : "×"}</span>
            <div>
              <strong>{capability.label}</strong>
              <small>{capability.hint}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
