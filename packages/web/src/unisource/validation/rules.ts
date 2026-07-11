import type {
  DataFieldPrimitive,
  FieldCode,
  MemberId,
  SelectionRef,
} from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";

export type RuleGroup = "字段约束" | "跨源一致性" | "引用完整性" | "模板约束";
export type RuleLevel = "error" | "warning" | "passed";

export interface CellRef {
  readonly label: string;
  readonly objectId: string;
  readonly fieldCode: FieldCode;
  readonly value: DataFieldPrimitive;
  readonly updatedBy: MemberId;
  readonly updatedAt: string;
  readonly sourceLabel: string;
}

export interface FixActionDef {
  readonly id: string;
  readonly label: string;
  readonly tone: "primary" | "secondary";
  readonly placeholder?: boolean;
}

export interface RuleOutcome {
  readonly ruleCode: string;
  readonly group: RuleGroup;
  readonly level: RuleLevel;
  readonly title: string;
  readonly detail: string;
  readonly target?: SelectionRef;
  readonly compare?: {
    readonly authoritative: CellRef;
    readonly cached: CellRef;
  };
  readonly impact: readonly string[];
  readonly fixes: readonly FixActionDef[];
}

type RuleFn = (state: WorkspaceState) => RuleOutcome;

const pass = (
  ruleCode: string,
  group: RuleGroup,
  title: string,
  detail = "规则通过。",
): RuleOutcome => ({
  ruleCode,
  group,
  level: "passed",
  title,
  detail,
  impact: [],
  fixes: [],
});

function objectName(state: WorkspaceState, objectId: string): string {
  return String(
    state.objects.find((object) => object.id === objectId)?.fields.name
      ?.value ?? objectId,
  );
}

function fieldValue(
  state: WorkspaceState,
  objectId: string,
  fieldCode: FieldCode,
) {
  return state.objects.find((object) => object.id === objectId)?.fields[
    fieldCode
  ];
}

function cell(
  state: WorkspaceState,
  objectId: string,
  fieldCode: FieldCode,
  sourceLabel: string,
): CellRef {
  const value = fieldValue(state, objectId, fieldCode);
  return {
    label: `${objectName(state, objectId)} · ${fieldCode}`,
    objectId,
    fieldCode,
    value: value?.value ?? null,
    updatedBy: value?.updatedBy ?? "wangyun",
    updatedAt: value?.updatedAt ?? "",
    sourceLabel,
  };
}

function fld001(state: WorkspaceState): RuleOutcome {
  const invalid = state.objects.find((object) => {
    const value = object.fields.price?.value;
    return typeof value === "number" && value <= 0;
  });
  if (!invalid) return pass("FLD-001", "字段约束", "售价必须大于 0");
  return {
    ruleCode: "FLD-001",
    group: "字段约束",
    level: "error",
    title: "售价必须大于 0",
    detail: `${objectName(state, invalid.id)} 的售价不是正数。`,
    target: { entityType: "field", entityId: invalid.id, fieldCode: "price" },
    impact: ["产品规格库"],
    fixes: [],
  };
}

function fld002(state: WorkspaceState): RuleOutcome {
  const lifecycle = state.objectTypes
    .find((type) => type.code === "product_specs")
    ?.fields.find((field) => field.code === "lifecycle");
  const allowed = new Set(lifecycle?.enumValues ?? []);
  const invalid = state.objects.find(
    (object) =>
      object.objectTypeCode === "product_specs" &&
      !allowed.has(String(object.fields.lifecycle?.value ?? "")),
  );
  if (!invalid) return pass("FLD-002", "字段约束", "状态必须是合法枚举");
  return {
    ruleCode: "FLD-002",
    group: "字段约束",
    level: "error",
    title: "状态必须是合法枚举",
    detail: `${objectName(state, invalid.id)} 的状态不在模板枚举内。`,
    target: {
      entityType: "field",
      entityId: invalid.id,
      fieldCode: "lifecycle",
    },
    impact: ["产品状态盘点"],
    fixes: [],
  };
}

function fld003(state: WorkspaceState): RuleOutcome {
  const invalid = state.objects.find(
    (object) =>
      object.objectTypeCode === "product_specs" &&
      object.fields.lifecycle?.value === "预售" &&
      !object.fields.launch_date?.value,
  );
  if (!invalid) return pass("FLD-003", "字段约束", "预售状态必须有上市日期");
  return {
    ruleCode: "FLD-003",
    group: "字段约束",
    level: "error",
    title: "预售状态必须有上市日期",
    detail: `${objectName(state, invalid.id)} 缺少上市日期。`,
    target: {
      entityType: "field",
      entityId: invalid.id,
      fieldCode: "launch_date",
    },
    impact: ["产品规格书"],
    fixes: [],
  };
}

function fld004(state: WorkspaceState): RuleOutcome {
  const seen = new Map<DataFieldPrimitive, string>();
  for (const object of state.objects.filter(
    (item) => item.objectTypeCode === "product_specs",
  )) {
    const sku = object.fields.sku?.value;
    if (seen.has(sku)) {
      return {
        ruleCode: "FLD-004",
        group: "字段约束",
        level: "error",
        title: "型号必须唯一",
        detail: `${objectName(state, object.id)} 与 ${seen.get(sku)} 型号重复。`,
        target: { entityType: "field", entityId: object.id, fieldCode: "sku" },
        impact: ["产品规格库"],
        fixes: [],
      };
    }
    seen.set(sku, objectName(state, object.id));
  }
  return pass("FLD-004", "字段约束", "型号必须唯一");
}

function xsrc001(state: WorkspaceState): RuleOutcome {
  const authoritative = cell(state, "prod-s3", "price", "产品规格库");
  const cached = cell(
    state,
    "sales-offline-dealer",
    "cached_price",
    "渠道销量表",
  );
  if (authoritative.value === cached.value) {
    return pass("XSRC-001", "跨源一致性", "渠道售价缓存必须等于权威售价");
  }
  return {
    ruleCode: "XSRC-001",
    group: "跨源一致性",
    level: "error",
    title: "渠道售价缓存与权威售价不一致",
    detail: `缓存 ¥${cached.value} 与权威售价 ¥${authoritative.value} 不一致。`,
    target: {
      entityType: "field",
      entityId: cached.objectId,
      fieldCode: cached.fieldCode,
    },
    compare: { authoritative, cached },
    impact: ["渠道经营看板", "Q3 渠道周报"],
    fixes: [
      { id: "ignore", label: "设为例外", tone: "secondary" },
      { id: "sync-cache", label: "立即同步", tone: "primary" },
    ],
  };
}

function xsrc002(state: WorkspaceState): RuleOutcome {
  const invalid = state.objects.find(
    (object) =>
      object.objectTypeCode === "channel_sales" &&
      Number(object.fields.month_sales?.value ?? 0) < 0,
  );
  if (!invalid) return pass("XSRC-002", "跨源一致性", "渠道销量必须非负");
  return {
    ruleCode: "XSRC-002",
    group: "跨源一致性",
    level: "error",
    title: "渠道销量必须非负",
    detail: `${objectName(state, invalid.id)} 的销量为负数。`,
    target: {
      entityType: "field",
      entityId: invalid.id,
      fieldCode: "month_sales",
    },
    impact: ["渠道销量表"],
    fixes: [],
  };
}

function xsrc003(state: WorkspaceState): RuleOutcome {
  const quote = fieldValue(state, "contract-east-s3", "quote")?.value;
  const price = fieldValue(state, "prod-s3", "price")?.value;
  if (quote === price)
    return pass("XSRC-003", "跨源一致性", "合同报价等于权威售价");
  return {
    ruleCode: "XSRC-003",
    group: "跨源一致性",
    level: "error",
    title: "合同报价必须等于权威售价",
    detail: `合同报价 ¥${quote} 与权威售价 ¥${price} 不一致。`,
    target: {
      entityType: "field",
      entityId: "contract-east-s3",
      fieldCode: "quote",
    },
    impact: ["经销商供货协议"],
    fixes: [],
  };
}

function ref001(state: WorkspaceState): RuleOutcome {
  const objectIds = new Set(state.objects.map((object) => object.id));
  const invalid = state.fieldRefs.find((ref) => !objectIds.has(ref.objectId));
  if (!invalid) return pass("REF-001", "引用完整性", "引用对象必须存在");
  return {
    ruleCode: "REF-001",
    group: "引用完整性",
    level: "error",
    title: "引用对象不存在",
    detail: `引用 ${invalid.label} 指向已不存在对象。`,
    target: { entityType: "object", entityId: invalid.objectId },
    impact: ["文档引用"],
    fixes: [],
  };
}

function ref002(state: WorkspaceState): RuleOutcome {
  const invalid = state.fieldRefs.find((ref) => {
    const object = state.objects.find(
      (candidate) => candidate.id === ref.objectId,
    );
    return ref.state === "dangling" || !object?.fields[ref.fieldCode];
  });
  if (!invalid) return pass("REF-002", "引用完整性", "引用字段必须存在");
  return {
    ruleCode: "REF-002",
    group: "引用完整性",
    level: "error",
    title: "文档引用字段缺失",
    detail: `字段引用 ${invalid.label} 指向缺失字段 ${invalid.fieldCode}。`,
    target: {
      entityType: "field",
      entityId: invalid.objectId,
      fieldCode: invalid.fieldCode,
    },
    impact: ["智能门锁 S3 产品规格书", "Q3 渠道周报"],
    fixes: [
      { id: "locate-doc", label: "定位到文档", tone: "primary" },
      { id: "rebind-doc", label: "重新绑定…", tone: "secondary" },
    ],
  };
}

function tpl001(state: WorkspaceState): RuleOutcome {
  const invalid = state.slotBindings.find(
    (binding) => !binding.objectId || !binding.values.form_factor,
  );
  if (!invalid) return pass("TPL-001", "模板约束", "槽位约束字段齐备");
  return {
    ruleCode: "TPL-001",
    group: "模板约束",
    level: "error",
    title: "槽位约束字段不完整",
    detail: `${invalid.id} 缺少必要约束字段。`,
    target: { entityType: "object", entityId: invalid.objectId },
    impact: ["全屋智能门户方案"],
    fixes: [],
  };
}

function tpl003(state: WorkspaceState): RuleOutcome {
  const invalid = state.slotBindings.find(
    (binding) => binding.values.form_factor !== "ATX",
  );
  if (!invalid) return pass("TPL-003", "模板约束", "主板槽位版型必须 ATX");
  return {
    ruleCode: "TPL-003",
    group: "模板约束",
    level: "warning",
    title: "主板槽位版型不是 ATX",
    detail: `${objectName(state, invalid.objectId)} 绑定为 ${invalid.values.form_factor},建议换用 ATX 型号。`,
    target: { entityType: "object", entityId: invalid.objectId },
    impact: ["全屋智能门户方案"],
    fixes: [
      {
        id: "relax-template",
        label: "放宽约束",
        tone: "secondary",
        placeholder: true,
      },
      { id: "use-atx", label: "换用 ATX 型号", tone: "primary" },
    ],
  };
}

export const validationRules: readonly RuleFn[] = [
  fld001,
  fld002,
  fld003,
  fld004,
  xsrc001,
  xsrc002,
  xsrc003,
  ref001,
  ref002,
  tpl001,
  tpl003,
];

export function runValidationRules(
  state: WorkspaceState,
): readonly RuleOutcome[] {
  return validationRules.map((rule) => rule(state));
}

export function deriveShareBlocked(
  results: readonly RuleOutcome[],
  ignored: ReadonlySet<string>,
): string | null {
  return results.some(
    (result) => result.level === "error" && !ignored.has(result.ruleCode),
  )
    ? "存在校验错误,修复后可分享"
    : null;
}
