import { MatrixView, type ObjectType } from "@m-next/views";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import { useWorkbenchContext } from "./workbench";

interface MatrixRelationOption {
  readonly code: string;
  readonly label: string;
  readonly rowType: string;
  readonly colType: string;
}

interface MatrixConfig {
  readonly rowType: string;
  readonly colType: string;
  readonly relationType: string;
}

export const knownMatrixRelations: readonly MatrixRelationOption[] = [
  { code: "adjacent", label: "Adjacent", rowType: "room", colType: "room" },
  {
    code: "contains",
    label: "Contains",
    rowType: "floorplan",
    colType: "room",
  },
  {
    code: "proposal_contains_system",
    label: "Contains System",
    rowType: "proposal",
    colType: "system",
  },
  {
    code: "proposal_contains_module",
    label: "Contains Module",
    rowType: "module",
    colType: "module",
  },
  {
    code: "proposal_depends_on",
    label: "Depends On",
    rowType: "module",
    colType: "module",
  },
  {
    code: "proposal_interfaces_with",
    label: "Interfaces With",
    rowType: "module",
    colType: "interface",
  },
  {
    code: "proposal_satisfies",
    label: "Satisfies",
    rowType: "module",
    colType: "requirement",
  },
  {
    code: "quality_trace",
    label: "Trace",
    rowType: "quality_requirement",
    colType: "quality_function",
  },
];

export function relationOptionsForTypes(
  objectTypes: readonly ObjectType[],
): readonly MatrixRelationOption[] {
  const codes = new Set(objectTypes.map((type) => type.code));
  const matched = knownMatrixRelations.filter(
    (option) => codes.has(option.rowType) && codes.has(option.colType),
  );
  return matched.length > 0 ? matched : knownMatrixRelations;
}

export function inferMatrixConfig(
  objectTypes: readonly ObjectType[],
  fallbackObjectType: string,
  fallbackRelationType: string,
): MatrixConfig {
  const codes = new Set(objectTypes.map((type) => type.code));
  if (codes.has("room")) {
    return { rowType: "room", colType: "room", relationType: "adjacent" };
  }
  if (codes.has("module") && codes.has("requirement")) {
    return {
      rowType: "module",
      colType: "requirement",
      relationType: "proposal_satisfies",
    };
  }
  const firstType = objectTypes[0]?.code ?? fallbackObjectType;
  const relation =
    relationOptionsForTypes(objectTypes)[0]?.code || fallbackRelationType;
  return { rowType: firstType, colType: firstType, relationType: relation };
}

export function MatrixPanel(): ReactElement {
  const context = useWorkbenchContext();
  const {
    commandClient,
    objectType,
    relationType,
    reportError,
    selection,
    viewClient,
    workspaceId,
  } = context;
  const [objectTypes, setObjectTypes] = useState<readonly ObjectType[]>([]);
  const [config, setConfig] = useState<MatrixConfig>(() => ({
    rowType: objectType,
    colType: objectType,
    relationType,
  }));
  const [loadingTypes, setLoadingTypes] = useState(true);

  useEffect(() => {
    let disposed = false;
    async function loadTypes(): Promise<void> {
      setLoadingTypes(true);
      try {
        const loaded = await viewClient.objectTypes(workspaceId);
        if (disposed) return;
        setObjectTypes(loaded);
        setConfig(inferMatrixConfig(loaded, objectType, relationType));
      } catch (error) {
        if (!disposed) {
          setObjectTypes([]);
          reportError(
            error instanceof Error ? error.message : "矩阵配置加载失败",
          );
        }
      } finally {
        if (!disposed) setLoadingTypes(false);
      }
    }
    void loadTypes();
    return () => {
      disposed = true;
    };
  }, [objectType, relationType, reportError, viewClient, workspaceId]);

  const relationOptions = useMemo(
    () => relationOptionsForTypes(objectTypes),
    [objectTypes],
  );

  const hasTypes = objectTypes.length > 0;

  return (
    <div className="matrix-panel">
      <section className="matrix-config-bar" aria-label="矩阵配置">
        <label>
          行类型
          <select
            disabled={!hasTypes}
            onChange={(event) =>
              setConfig((value) => ({
                ...value,
                rowType: event.currentTarget.value,
              }))
            }
            value={config.rowType}
          >
            {objectTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.name || type.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          列类型
          <select
            disabled={!hasTypes}
            onChange={(event) =>
              setConfig((value) => ({
                ...value,
                colType: event.currentTarget.value,
              }))
            }
            value={config.colType}
          >
            {objectTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.name || type.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          关系类型
          <select
            onChange={(event) =>
              setConfig((value) => ({
                ...value,
                relationType: event.currentTarget.value,
              }))
            }
            value={config.relationType}
          >
            {relationOptions.map((relation) => (
              <option key={relation.code} value={relation.code}>
                {relation.label} · {relation.code}
              </option>
            ))}
          </select>
        </label>
        {loadingTypes ? <span>配置加载中...</span> : null}
      </section>
      {!hasTypes && !loadingTypes ? (
        <p className="view-empty-state">当前工作空间没有可用对象类型。</p>
      ) : null}
      {hasTypes ? (
        <MatrixView
          colType={config.colType}
          commandClient={commandClient}
          onError={reportError}
          relationType={config.relationType}
          rowType={config.rowType}
          selection={selection}
          viewClient={viewClient}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  );
}
