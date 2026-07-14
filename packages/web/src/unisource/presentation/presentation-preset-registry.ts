import type {
  PresentationObjectBinding,
  PresentationRelationBinding,
} from "../data/identity-remap";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import { pcProcurementPreset } from "./pc-procurement-preset";

export type PresentationPresetCode =
  | "hardware_products"
  | "pc_procurement"
  | "unknown";

type PresentationFields = Pick<
  DemoSeed,
  | "expressions"
  | "views"
  | "docModels"
  | "fieldRefs"
  | "kpis"
  | "biBars"
  | "anaReports"
  | "slotBindings"
>;

export interface PresentationPreset extends PresentationFields {
  readonly code: PresentationPresetCode;
  readonly objectBindings: readonly PresentationObjectBinding[];
  readonly relationBindings: readonly PresentationRelationBinding[];
}

export class PresentationPresetRegistry {
  resolve(templateCode: string | null | undefined): PresentationPreset {
    const preset =
      templateCode === "hardware_products"
        ? hardwareProductsPreset()
        : templateCode === "pc_procurement"
          ? pcProcurementPreset
          : unknownPreset;
    return structuredClone(preset) as PresentationPreset;
  }
}

function hardwareProductsPreset(): PresentationPreset {
  const seed = cloneDemoSeed();
  return {
    code: "hardware_products",
    expressions: seed.expressions,
    views: seed.views,
    docModels: seed.docModels,
    fieldRefs: seed.fieldRefs,
    kpis: seed.kpis,
    biBars: seed.biBars,
    anaReports: seed.anaReports,
    slotBindings: seed.slotBindings,
    objectBindings: seed.objects.map((object) => ({
      presentationId: object.id,
      objectTypeCode: object.objectTypeCode,
      fields: Object.fromEntries(
        ["code", "sku", "name"].flatMap((fieldCode) => {
          const value = object.fields[fieldCode]?.value;
          return typeof value === "string" && value.trim()
            ? [[fieldCode, value.trim()]]
            : [];
        }),
      ),
    })),
    relationBindings: seed.relations.map((relation) => ({
      presentationId: relation.id,
      relationTypeCode: relation.relationTypeCode,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
    })),
  };
}

const unknownPreset: PresentationPreset = {
  code: "unknown",
  expressions: [
    {
      id: "exp-generic-data",
      name: "数据工作台",
      viewIds: ["view-generic-grid"],
      defaultViewId: "view-generic-grid",
      defaultForm: "grid",
      activityMember: "wangyun",
      lastActivity: "按工作空间数据加载",
    },
  ],
  views: [
    {
      id: "view-generic-grid",
      exprId: "exp-generic-data",
      kind: "grid",
      config: { sourceFallback: true },
    },
  ],
  docModels: [],
  fieldRefs: [],
  kpis: [],
  biBars: [],
  anaReports: [],
  slotBindings: [],
  objectBindings: [],
  relationBindings: [],
};
