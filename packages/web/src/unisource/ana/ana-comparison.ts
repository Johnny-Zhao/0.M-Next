import type { SelectionRef } from "../model/kernel";
import { traverseObjectSubtree } from "../model/object-subtree";
import type { WorkspaceState } from "../state/workspace-store";
import type { RuleOutcome } from "../validation/rules";

const terminalStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export interface AnaComparisonColumn {
  readonly key: string;
  readonly label: string;
  readonly fieldCode: string;
  readonly derived?: boolean;
  readonly relationPath?: readonly string[];
  readonly unit?: string;
}

export interface AnaComparisonConfig {
  readonly sourceObjectTypeCode: string;
  readonly scopeRelationTypeCodes: readonly string[];
  readonly scopeDepth: number;
  readonly columns: readonly AnaComparisonColumn[];
  readonly analysisQuestions?: readonly AnaAnalysisQuestion[];
}

export interface AnaAnalysisQuestion {
  readonly id: string;
  readonly label: string;
  readonly kind: "min" | "max" | "status";
  readonly fieldCode?: string;
  readonly ruleCodes?: readonly string[];
  readonly status?: AnaComparisonRow["status"];
}

export interface AnaComparisonRow {
  readonly objectId: string;
  readonly values: Readonly<Record<string, string | null>>;
  /** Raw read-model values used for numeric comparisons; never display text. */
  readonly rawValues?: Readonly<Record<string, unknown>>;
  readonly status: "ok" | "block" | "warn" | "unchecked";
  readonly issueCount: number;
}

export interface AnaComparisonIssue {
  readonly ruleCode: string;
  readonly level: "BLOCK" | "WARN";
  readonly title: string;
  readonly detail: string;
  readonly selection: SelectionRef | null;
  readonly state: "ready" | "dangling";
  readonly planObjectIds: readonly string[];
}

export interface AnaComparisonVm {
  readonly state: "ready" | "no-plans" | "missing-derived" | "unvalidated";
  readonly rows: readonly AnaComparisonRow[];
  readonly columns: readonly AnaComparisonColumn[];
  readonly issues: readonly AnaComparisonIssue[];
  readonly stale: boolean;
  readonly questions: readonly {
    readonly id: string;
    readonly label: string;
    readonly answer: string | null;
    readonly objectId: string | null;
  }[];
  readonly summary: {
    readonly total: number;
    readonly ok: number;
    readonly block: number;
    readonly warn: number;
  };
}

export function readAnaComparisonConfig(
  value: unknown,
): AnaComparisonConfig | null {
  if (!isRecord(value) || typeof value.sourceObjectTypeCode !== "string")
    return null;
  if (
    !Array.isArray(value.scopeRelationTypeCodes) ||
    !Array.isArray(value.columns)
  )
    return null;
  const columns = value.columns.flatMap(readColumn);
  if (columns.length !== value.columns.length) return null;
  return {
    sourceObjectTypeCode: value.sourceObjectTypeCode,
    scopeRelationTypeCodes: value.scopeRelationTypeCodes.filter(
      (item): item is string => typeof item === "string",
    ),
    scopeDepth: boundedDepth(value.scopeDepth),
    columns,
    analysisQuestions: readQuestions(value.analysisQuestions),
  };
}

export function buildAnaComparison(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  config: AnaComparisonConfig,
  results: readonly RuleOutcome[],
  validationStatus: "idle" | "running" | "ready" | "error",
  validationStale = false,
): AnaComparisonVm {
  const plans = workspace.objects.filter(
    (object) =>
      object.objectTypeCode === config.sourceObjectTypeCode &&
      !terminalStatuses.has(object.status),
  );
  const memberships = new Map(
    plans.map((plan) => [
      plan.id,
      traverseObjectSubtree(
        workspace,
        plan.id,
        config.scopeRelationTypeCodes,
        config.scopeDepth,
      )?.objectIds ?? new Set([plan.id]),
    ]),
  );
  const issues = comparisonIssues(workspace, results, memberships);
  const rows = plans.map((plan) =>
    comparisonRow(
      workspace,
      plan.id,
      config,
      issues.filter((issue) => issue.planObjectIds.includes(plan.id)),
      validationStatus,
    ),
  );
  return {
    state: comparisonState(rows, config, validationStatus),
    rows,
    columns: config.columns,
    issues,
    stale: validationStale,
    questions: buildQuestions(config.analysisQuestions ?? [], rows),
    summary: comparisonSummary(rows),
  };
}

function buildQuestions(
  questions: readonly AnaAnalysisQuestion[],
  rows: readonly AnaComparisonRow[],
) {
  return questions.map((question) => {
    if (question.kind === "status") {
      const matches = rows.filter((row) => row.status === question.status);
      return {
        id: question.id,
        label: question.label,
        answer:
          matches.length > 0
            ? matches.map((row) => row.values.name ?? row.objectId).join("、")
            : null,
        objectId: matches[0]?.objectId ?? null,
      };
    }
    const candidates = rows.flatMap((row) => {
      const raw = question.fieldCode
        ? row.rawValues?.[question.fieldCode]
        : null;
      const value = finiteNumber(raw);
      return Number.isFinite(value) ? [{ row, value }] : [];
    });
    if (candidates.length === 0)
      return {
        id: question.id,
        label: question.label,
        answer: null,
        objectId: null,
      };
    const selected = candidates.reduce((best, candidate) =>
      question.kind === "min"
        ? candidate.value < best.value
          ? candidate
          : best
        : candidate.value > best.value
          ? candidate
          : best,
    );
    return {
      id: question.id,
      label: question.label,
      answer: `${selected.row.values.name ?? selected.row.objectId}: ${selected.row.values[question.fieldCode ?? ""] ?? selected.value}`,
      objectId: selected.row.objectId,
    };
  });
}

export function anaSelectionForRow(row: AnaComparisonRow): SelectionRef {
  return { entityType: "object", entityId: row.objectId };
}

export function anaSelectionForIssue(
  issue: AnaComparisonIssue,
): SelectionRef | null {
  return issue.state === "ready" ? issue.selection : null;
}

function comparisonIssues(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  results: readonly RuleOutcome[],
  memberships: ReadonlyMap<string, ReadonlySet<string>>,
): readonly AnaComparisonIssue[] {
  return results.flatMap((result) => {
    const level = ruleLevel(result);
    if (!level) return [];
    const targetIds = targetObjectIds(workspace, result.target ?? null);
    const planObjectIds = Array.from(memberships).flatMap(
      ([planId, members]) =>
        targetIds.some((id) => members.has(id)) ? [planId] : [],
    );
    return [
      {
        ruleCode: result.ruleCode,
        level,
        title: result.title,
        detail: result.detail,
        selection: result.target ?? null,
        state: targetIds.length === 0 ? "dangling" : "ready",
        planObjectIds,
      },
    ];
  });
}

function comparisonRow(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  objectId: string,
  config: AnaComparisonConfig,
  issues: readonly AnaComparisonIssue[],
  validationStatus: "idle" | "running" | "ready" | "error",
): AnaComparisonRow {
  const resolved = config.columns.map((column) => {
    const objects = resolveColumnObjects(workspace, objectId, column);
    return {
      key: column.key,
      raw: rawValue(objects, column),
      display: displayValue(objects, column),
    };
  });
  return {
    objectId,
    values: Object.fromEntries(
      resolved.map((entry) => [entry.key, entry.display]),
    ),
    rawValues: Object.fromEntries(
      resolved.map((entry) => [entry.key, entry.raw]),
    ),
    status: comparisonStatus(issues, validationStatus),
    issueCount: issues.length,
  };
}

function rawValue(
  objects: readonly WorkspaceState["objects"][number][],
  column: AnaComparisonColumn,
): unknown {
  return (
    objects.find((object) => object.fields[column.fieldCode]?.value != null)
      ?.fields[column.fieldCode]?.value ?? null
  );
}

function finiteNumber(value: unknown): number {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== "string" || value.trim() === "") return Number.NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function resolveColumnObjects(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  objectId: string,
  column: AnaComparisonColumn,
): readonly WorkspaceState["objects"][number][] {
  let current = workspace.objects.filter((item) => item.id === objectId);
  for (const relationTypeCode of column.relationPath ?? []) {
    const targetIds = new Set(
      workspace.relations
        .filter(
          (relation) =>
            relation.status === "active" &&
            relation.relationTypeCode === relationTypeCode &&
            current.some((object) => object.id === relation.sourceId),
        )
        .map((relation) => relation.targetId),
    );
    current = workspace.objects.filter(
      (object) =>
        targetIds.has(object.id) && !terminalStatuses.has(object.status),
    );
  }
  return current;
}

function displayValue(
  objects: readonly WorkspaceState["objects"][number][],
  column: AnaComparisonColumn,
): string | null {
  const values = Array.from(
    new Set(
      objects
        .map((object) => object.fields[column.fieldCode]?.value ?? null)
        .filter((value): value is Exclude<typeof value, null> => value !== null)
        .map((value) => String(value)),
    ),
  );
  if (values.length === 0) return null;
  return `${values.join("、")}${column.unit ? ` ${column.unit}` : ""}`;
}

function comparisonStatus(
  issues: readonly AnaComparisonIssue[],
  validationStatus: "idle" | "running" | "ready" | "error",
): AnaComparisonRow["status"] {
  if (validationStatus !== "ready") return "unchecked";
  if (issues.some((issue) => issue.level === "BLOCK")) return "block";
  return issues.some((issue) => issue.level === "WARN") ? "warn" : "ok";
}

function comparisonState(
  rows: readonly AnaComparisonRow[],
  config: AnaComparisonConfig,
  validationStatus: "idle" | "running" | "ready" | "error",
): AnaComparisonVm["state"] {
  if (rows.length === 0) return "no-plans";
  const derivedKeys = config.columns
    .filter((column) => column.derived && !column.relationPath?.length)
    .map((column) => column.key);
  if (
    derivedKeys.length > 0 &&
    rows.some((row) => derivedKeys.every((key) => row.values[key] === null))
  )
    return "missing-derived";
  return validationStatus === "ready" ? "ready" : "unvalidated";
}

function comparisonSummary(rows: readonly AnaComparisonRow[]) {
  return rows.reduce(
    (summary, row) => ({
      ...summary,
      [row.status]: summary[row.status] + 1,
    }),
    { total: rows.length, ok: 0, block: 0, warn: 0, unchecked: 0 },
  );
}

function ruleLevel(result: RuleOutcome): AnaComparisonIssue["level"] | null {
  return result.level === "error"
    ? "BLOCK"
    : result.level === "warning"
      ? "WARN"
      : null;
}

function targetObjectIds(
  workspace: Pick<WorkspaceState, "objects" | "relations">,
  target: SelectionRef | null,
): readonly string[] {
  if (!target) return [];
  if (target.entityType !== "relation")
    return workspace.objects.some(
      (object) =>
        object.id === target.entityId && !terminalStatuses.has(object.status),
    )
      ? [target.entityId]
      : [];
  const relation = workspace.relations.find(
    (item) => item.id === target.entityId,
  );
  const endpoints = relation ? [relation.sourceId, relation.targetId] : [];
  return endpoints.every((id) =>
    workspace.objects.some(
      (object) => object.id === id && !terminalStatuses.has(object.status),
    ),
  )
    ? endpoints
    : [];
}

function readColumn(value: unknown): readonly AnaComparisonColumn[] {
  if (!isRecord(value)) return [];
  if (
    typeof value.key !== "string" ||
    typeof value.label !== "string" ||
    typeof value.fieldCode !== "string"
  )
    return [];
  const relationPath = Array.isArray(value.relationPath)
    ? value.relationPath.filter(
        (item): item is string => typeof item === "string",
      )
    : undefined;
  if (
    Array.isArray(value.relationPath) &&
    (relationPath?.length !== value.relationPath.length ||
      relationPath.length > 5)
  )
    return [];
  return [
    {
      key: value.key,
      label: value.label,
      fieldCode: value.fieldCode,
      derived: value.derived === true,
      relationPath,
      unit: typeof value.unit === "string" ? value.unit : undefined,
    },
  ];
}

function readQuestions(
  value: unknown,
): readonly AnaAnalysisQuestion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const questions = value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.label !== "string"
    )
      return [];
    if (entry.kind !== "min" && entry.kind !== "max" && entry.kind !== "status")
      return [];
    return [
      {
        id: entry.id,
        label: entry.label,
        kind: entry.kind as AnaAnalysisQuestion["kind"],
        fieldCode:
          typeof entry.fieldCode === "string" ? entry.fieldCode : undefined,
        status:
          typeof entry.status === "string"
            ? (entry.status as AnaComparisonRow["status"])
            : undefined,
        ruleCodes: Array.isArray(entry.ruleCodes)
          ? entry.ruleCodes.filter(
              (item): item is string => typeof item === "string",
            )
          : undefined,
      },
    ];
  });
  return questions.length === value.length ? questions : undefined;
}

function boundedDepth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(5, Math.trunc(value)))
    : 1;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
