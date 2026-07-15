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
    views: seed.views.map((view) => ({
      ...view,
      config: { ...view.config, ...hardwareViewConfig[view.id] },
    })),
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

const hardwareViewConfig: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  "view-dashboard-bi": {
    title: "各渠道销量 · 本月",
    sourceLabel: "渠道销量表",
    emptyLabel: "暂无渠道销量数据",
    objectTypeCodes: ["product_specs"],
  },
  "view-weekly-bi": {
    title: "各渠道销量 · 本月",
    sourceLabel: "渠道销量表",
    emptyLabel: "暂无渠道销量数据",
  },
  "view-dashboard-ana": { allowReanalysis: true },
  "view-inventory-matrix": {
    allowColumnMove: true,
    dimValues: ["停产"],
    interactionHint:
      "矩阵即描述形式:拖动卡片跨列 = 修改『状态』字段,表格与所有文档引用同步更新。",
  },
  "view-build-z890-doc": hardwareConfigDoc("Z890"),
  "view-build-b860-doc": hardwareConfigDoc("B860"),
};

function hardwareConfigDoc(suffix: string): Readonly<Record<string, unknown>> {
  return {
    documentNo: `BUILD-${suffix}-001`,
    title: `装机配置单·${suffix}`,
    authorLine: "王芸 · 供应链 | 字段来自硬件产品库",
    intro:
      "本配置单由模板槽位实时生成。任一硬件产品库字段更新后，价格与合计同步刷新。",
    tableTitle: "配置明细 · 来自槽位绑定",
    nameFieldCode: "name",
    valueFieldCode: "price",
    totalLabel: "合计",
    totalPrefix: "¥",
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
