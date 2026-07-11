import { UsDiffBadge, UsMonoTag } from "../primitives";
import type { ImportViewModel } from "./import-view-model";

export function TargetDiffList({
  vm,
  confirmedIds,
  onToggleConfirm,
}: {
  readonly vm: ImportViewModel;
  readonly confirmedIds: ReadonlySet<string>;
  readonly onToggleConfirm: (itemId: string) => void;
}) {
  return (
    <div className="us-targetdiff">
      {vm.groups.map((group) => (
        <section key={group.title}>
          <header>{group.title}</header>
          {group.rows.map((row) => (
            <article
              data-confidence={row.confidenceTone}
              data-status={row.status}
              key={row.id}
            >
              <UsDiffBadge
                op={
                  row.op === "add"
                    ? "add"
                    : row.op === "skip"
                      ? "skip"
                      : "change"
                }
              />
              <span>
                <strong>{row.title}</strong>
                <small className="us-data">
                  {row.oldText} → {row.nextText}
                </small>
              </span>
              <UsMonoTag
                tone={row.confidenceTone === "change" ? "change" : "primary"}
              >
                {Math.round(row.confidence * 100)}%
              </UsMonoTag>
              {row.status === "written" ? <b>已写入 ✓</b> : null}
              {row.needsConfirm ? (
                <label>
                  <input
                    checked={confirmedIds.has(row.id)}
                    onChange={() => onToggleConfirm(row.id)}
                    type="checkbox"
                  />
                  确认
                </label>
              ) : null}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
