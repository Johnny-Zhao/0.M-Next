import { type ReactElement } from "react";

import type { RelationSummary, ViewClient, ViewObject } from "@m-next/views";

import { objectDisplayTitle } from "../display-labels";

export const requirementCoverageRelation = "proposal_satisfies";
const coveragePageSize = 200;

export interface RequirementCoverageItem {
  readonly requirement: ViewObject;
  readonly relationIds: readonly string[];
  readonly covered: boolean;
}

export interface RequirementCoverageSummary {
  readonly total: number;
  readonly covered: number;
  readonly uncovered: number;
  readonly coverageRate: number;
  readonly items: readonly RequirementCoverageItem[];
  readonly uncoveredItems: readonly RequirementCoverageItem[];
}

export function summarizeRequirementCoverage(
  requirements: readonly ViewObject[],
  relations: readonly RelationSummary[],
): RequirementCoverageSummary {
  const relationIdsByRequirement = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.relationType !== requirementCoverageRelation) continue;
    const relationIds = relationIdsByRequirement.get(relation.targetId) ?? [];
    relationIds.push(relation.relationId);
    relationIdsByRequirement.set(relation.targetId, relationIds);
  }

  const items = requirements.map((requirement) => {
    const relationIds =
      relationIdsByRequirement.get(requirement.objectId) ?? [];
    return {
      requirement,
      relationIds,
      covered: relationIds.length > 0,
    };
  });
  const covered = items.filter((item) => item.covered).length;
  const total = items.length;
  const uncoveredItems = items.filter((item) => !item.covered);
  return {
    total,
    covered,
    uncovered: total - covered,
    coverageRate: total === 0 ? 0 : Math.round((covered / total) * 100),
    items,
    uncoveredItems,
  };
}

export async function collectRequirementCoverage(params: {
  readonly viewClient: Pick<ViewClient, "objects" | "relations">;
  readonly workspaceId: string;
}): Promise<RequirementCoverageSummary> {
  const [modules, requirements] = await Promise.all([
    params.viewClient.objects(
      params.workspaceId,
      "module",
      0,
      coveragePageSize,
    ),
    params.viewClient.objects(
      params.workspaceId,
      "requirement",
      0,
      coveragePageSize,
    ),
  ]);
  const relationPages = await Promise.all(
    modules.items.map((module) =>
      params.viewClient.relations(
        params.workspaceId,
        requirementCoverageRelation,
        "out",
        module.objectId,
        1,
      ),
    ),
  );
  return summarizeRequirementCoverage(
    requirements.items,
    dedupeRelations(relationPages.flat()),
  );
}

export function RequirementCoverageSummaryView(props: {
  readonly summary: RequirementCoverageSummary | null;
  readonly loading: boolean;
  readonly onSelectRequirement: (requirementId: string) => void;
}): ReactElement {
  const { loading, onSelectRequirement, summary } = props;
  return (
    <section className="mapping-coverage" aria-label="需求覆盖总览">
      <header>
        <strong>需求覆盖</strong>
        {summary ? (
          <span>
            已覆盖 {summary.covered} / 未覆盖 {summary.uncovered} / 覆盖率{" "}
            {summary.coverageRate}%
          </span>
        ) : null}
      </header>
      {loading ? <p className="validate-empty">覆盖关系加载中...</p> : null}
      {!loading && summary && summary.total === 0 ? (
        <p className="validate-empty">暂无需求。</p>
      ) : null}
      {!loading && summary && summary.total > 0 && summary.uncovered === 0 ? (
        <p className="validate-empty">全部需求已有模块覆盖。</p>
      ) : null}
      {!loading && summary && summary.uncovered > 0 ? (
        <ul className="validate-list" aria-label="未覆盖需求">
          {summary.uncoveredItems.map((item) => (
            <li key={item.requirement.objectId}>
              <button
                className="validate-row validate-row-warn"
                onClick={() => onSelectRequirement(item.requirement.objectId)}
                type="button"
              >
                <span className="validate-badge validate-badge-warn">
                  未覆盖
                </span>
                <span className="validate-rule">R-TD-COV</span>
                <span className="validate-msg">
                  {objectDisplayTitle(item.requirement)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function dedupeRelations(
  relations: readonly RelationSummary[],
): readonly RelationSummary[] {
  const seen = new Set<string>();
  const deduped: RelationSummary[] = [];
  for (const relation of relations) {
    if (seen.has(relation.relationId)) continue;
    seen.add(relation.relationId);
    deduped.push(relation);
  }
  return deduped;
}
