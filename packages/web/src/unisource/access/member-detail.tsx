import type { MemberId, PermissionMatrix } from "../model/kernel";
import type { Member } from "../model/view-layer";
import { UsAvatar, UsMonoTag } from "../primitives";
import { deriveCapabilities, permissionLabel } from "./capability-list";
import { permissionResources } from "./permission-matrix";

export function MemberDetail({
  member,
  permissions,
}: {
  readonly member: Member;
  readonly permissions: PermissionMatrix;
}) {
  const resource = permissionResources[0];
  const level = permissions[member.id as MemberId]?.[resource.code] ?? "none";
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
        </div>
      </header>
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
