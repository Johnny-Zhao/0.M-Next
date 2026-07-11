import type {
  ChangeSet,
  CheckResult,
  Comment,
  DataFieldPrimitive,
  DataFieldValue,
  DataObject,
  DataRelation,
  ObjectTypeDef,
  OutputSnapshot,
  PermissionMatrix,
  RelationType,
  SceneTemplate,
  ViewDef,
  Workspace,
} from "../model/kernel";
import type {
  ActivityItem,
  BiBarDef,
  ChangeEvent,
  ChatMessage,
  DocModel,
  Expression,
  FieldRef,
  KpiCardDef,
  Member,
  PluginDef,
  RawImport,
  SimScenario,
} from "../model/view-layer";

const at = {
  baseline: "2026-07-10T09:12:00+08:00",
  import: "2026-07-10T10:18:00+08:00",
  confirmed: "2026-07-10T10:24:00+08:00",
  validation: "2026-07-10T10:32:00+08:00",
} as const;

function fv(
  value: DataFieldPrimitive,
  fieldVersion = 1,
  source: "manual" | "ai" = "manual",
): DataFieldValue {
  return {
    value,
    fieldVersion,
    updatedBy: source === "ai" ? "ai" : "wangyun",
    updatedAt: at.confirmed,
    source,
  };
}

function dataObject(params: {
  readonly id: string;
  readonly objectTypeCode: string;
  readonly status?: DataObject["status"];
  readonly fields: Record<string, DataFieldPrimitive>;
  readonly source?: "manual" | "ai";
}): DataObject {
  return {
    id: params.id,
    objectTypeCode: params.objectTypeCode,
    status: params.status ?? "active",
    version: 1,
    fields: Object.fromEntries(
      Object.entries(params.fields).map(([code, value]) => [
        code,
        fv(value, 1, params.source),
      ]),
    ),
    createdBy: params.source === "ai" ? "ai" : "wangyun",
    createdAt: at.baseline,
    updatedBy: params.source === "ai" ? "ai" : "wangyun",
    updatedAt: at.confirmed,
  };
}

export interface DemoSeed {
  readonly workspace: Workspace;
  readonly members: readonly Member[];
  readonly objectTypes: readonly ObjectTypeDef[];
  readonly objects: readonly DataObject[];
  readonly relationTypes: readonly RelationType[];
  readonly relations: readonly DataRelation[];
  readonly comments: readonly Comment[];
  readonly permissions: PermissionMatrix;
  readonly sceneTemplates: readonly SceneTemplate[];
  readonly expressions: readonly Expression[];
  readonly views: readonly ViewDef[];
  readonly docModels: readonly DocModel[];
  readonly fieldRefs: readonly FieldRef[];
  readonly kpis: readonly KpiCardDef[];
  readonly biBars: readonly BiBarDef[];
  readonly rawImport: RawImport;
  readonly chatMessages: readonly ChatMessage[];
  readonly checkResults: readonly CheckResult[];
  readonly changeSets: readonly ChangeSet[];
  readonly changeEvents: readonly ChangeEvent[];
  readonly activity: readonly ActivityItem[];
  readonly outputSnapshots: readonly OutputSnapshot[];
  readonly plugins: readonly PluginDef[];
  readonly simScenarios: readonly SimScenario[];
}

export const productType: ObjectTypeDef = {
  code: "product_specs",
  name: "产品规格库",
  group: "产品中心",
  fields: [
    { code: "sku", name: "产品编号", dataType: "text" },
    { code: "name", name: "名称", dataType: "text" },
    { code: "price", name: "权威售价", dataType: "number", unit: "CNY" },
    { code: "battery_months", name: "续航(月)", dataType: "number" },
    { code: "rating", name: "防护等级", dataType: "text" },
    { code: "launch_date", name: "上市日期", dataType: "date" },
    {
      code: "lifecycle",
      name: "状态",
      dataType: "enum",
      enumValues: ["预售", "研发中", "在售", "停产"],
    },
  ],
};

export const objectTypes: readonly ObjectTypeDef[] = [
  productType,
  {
    code: "channel_sales",
    name: "渠道销量表",
    group: "销售中心",
    fields: [
      { code: "channel", name: "渠道", dataType: "text" },
      { code: "month_sales", name: "本月销量", dataType: "number" },
      { code: "cached_price", name: "S3 售价缓存", dataType: "number" },
    ],
  },
  {
    code: "contracts",
    name: "合同台账",
    group: "产品中心",
    fields: [
      { code: "name", name: "合同名称", dataType: "text" },
      { code: "product", name: "产品", dataType: "text" },
      { code: "channel", name: "渠道", dataType: "text" },
      { code: "quote", name: "报价", dataType: "number", unit: "CNY" },
      { code: "contact", name: "联系人", dataType: "text" },
      { code: "amount", name: "金额", dataType: "number", unit: "CNY" },
    ],
  },
  {
    code: "customers",
    name: "客户信息库",
    group: "客户中心",
    fields: [
      { code: "name", name: "客户名称", dataType: "text" },
      { code: "region", name: "区域", dataType: "text" },
    ],
  },
];

const products: readonly DataObject[] = [
  dataObject({
    id: "prod-s3",
    objectTypeCode: "product_specs",
    status: "presale",
    fields: {
      sku: "DL-S3-2026",
      name: "门锁 S3",
      price: 1199,
      battery_months: 14,
      rating: "IP65",
      launch_date: "2026-08-18",
      lifecycle: "预售",
    },
  }),
  dataObject({
    id: "prod-s3-lite",
    objectTypeCode: "product_specs",
    status: "dev",
    fields: {
      sku: "DL-S3-LITE",
      name: "门锁 S3 Lite",
      price: 899,
      battery_months: 12,
      rating: "IP54",
      launch_date: null,
      lifecycle: "研发中",
    },
  }),
  dataObject({
    id: "prod-d2-pro",
    objectTypeCode: "product_specs",
    status: "presale",
    fields: {
      sku: "DB-D2-PRO",
      name: "门铃 D2 Pro",
      price: 599,
      battery_months: 8,
      rating: "IP54",
      launch_date: "2026-09-10",
      lifecycle: "预售",
    },
  }),
  dataObject({
    id: "prod-d2",
    objectTypeCode: "product_specs",
    status: "sale",
    fields: {
      sku: "DB-D2",
      name: "门铃 D2",
      price: 399,
      battery_months: 6,
      rating: "IP54",
      launch_date: "2025-11-02",
      lifecycle: "在售",
    },
  }),
  dataObject({
    id: "prod-e1",
    objectTypeCode: "product_specs",
    status: "sale",
    fields: {
      sku: "EYE-E1",
      name: "猫眼 E1",
      price: 699,
      battery_months: 10,
      rating: "IP54",
      launch_date: "2026-03-20",
      lifecycle: "在售",
    },
  }),
  dataObject({
    id: "prod-g2",
    objectTypeCode: "product_specs",
    status: "sale",
    fields: {
      sku: "GW-G2",
      name: "网关 G2",
      price: 199,
      battery_months: 0,
      rating: "Indoor",
      launch_date: "2025-08-18",
      lifecycle: "在售",
    },
  }),
  dataObject({
    id: "prod-m1",
    objectTypeCode: "product_specs",
    status: "sale",
    fields: {
      sku: "MAG-M1",
      name: "门磁 M1",
      price: 79,
      battery_months: 18,
      rating: "IP54",
      launch_date: "2025-05-12",
      lifecycle: "在售",
    },
  }),
  dataObject({
    id: "prod-p1",
    objectTypeCode: "product_specs",
    status: "eol",
    fields: {
      sku: "LOCK-P1",
      name: "挂锁 P1",
      price: 299,
      battery_months: 10,
      rating: "IP54",
      launch_date: "2024-09-01",
      lifecycle: "停产",
    },
  }),
];

const channelSales: readonly DataObject[] = Array.from({ length: 42 }, (_, i) =>
  dataObject({
    id: i === 0 ? "sales-offline-dealer" : `sales-channel-${i + 1}`,
    objectTypeCode: "channel_sales",
    fields: {
      channel:
        i === 0 ? "线下经销" : `区域渠道 ${String(i + 1).padStart(2, "0")}`,
      month_sales: i === 0 ? 2850 : 120 + i * 7,
      cached_price: i === 0 ? 1299 : 1199,
    },
  }),
);

const contractObjects: readonly DataObject[] = [
  dataObject({
    id: "contract-east-s3",
    objectTypeCode: "contracts",
    source: "ai",
    fields: {
      name: "华东智联 · S3 报价",
      product: "门锁 S3",
      channel: "华东经销",
      quote: 1199,
      contact: "老李 138****8000",
      amount: 880000,
    },
  }),
  dataObject({
    id: "contract-north-d2",
    objectTypeCode: "contracts",
    fields: { name: "北区门铃补货", product: "门铃 D2", amount: 240000 },
  }),
];

const customerObjects: readonly DataObject[] = [
  dataObject({
    id: "customer-east",
    objectTypeCode: "customers",
    fields: { name: "华东智联", region: "华东" },
  }),
  dataObject({
    id: "customer-south",
    objectTypeCode: "customers",
    fields: { name: "南区渠道联合体", region: "华南" },
  }),
];

const rawImportText =
  "老李发来华东经销报价: 门锁 S3 建议售价 1199 元,联系人 138****8000,上市日期可能是 8 月 18 日。防护等级 IP65 不变。";

function rawSpan(
  needle: string,
  tone: "primary" | "change",
): {
  readonly start: number;
  readonly end: number;
  readonly tone: "primary" | "change";
} {
  const start = rawImportText.indexOf(needle);
  return { start, end: start + needle.length, tone };
}

export const demoSeed: DemoSeed = {
  workspace: {
    id: "ws-unisource-demo",
    name: "智能硬件团队",
    currentMemberId: "wangyun",
    updatedAt: at.validation,
  },
  members: [
    { id: "wangyun", name: "王芸", role: "管理员", avatar: "wang" },
    { id: "lixiao", name: "李晓", role: "研发", avatar: "li" },
    { id: "chenmo", name: "陈默", role: "渠道运营", avatar: "chen" },
    { id: "zhouran", name: "周然", role: "法务", avatar: "zhou" },
    { id: "ai", name: "同源 AI", role: "代理", avatar: "ai" },
  ],
  objectTypes,
  objects: [
    ...products,
    ...channelSales,
    ...contractObjects,
    ...customerObjects,
  ],
  relationTypes: [
    {
      code: "interconnects_with",
      name: "互联",
      sourceTypeCode: "product_specs",
      targetTypeCode: "product_specs",
    },
  ],
  relations: [
    {
      id: "rel-s3-g2-interconnect",
      relationTypeCode: "interconnects_with",
      sourceId: "prod-s3",
      targetId: "prod-g2",
      status: "active",
      fields: {
        protocol: fv("Matter + BLE"),
        scenario: fv("全屋门户方案"),
      },
      version: 1,
      annotationIds: ["comment-rel-s3-g2"],
    },
  ],
  comments: [
    {
      id: "comment-rel-s3-g2",
      anchor: { entityType: "relation", entityId: "rel-s3-g2-interconnect" },
      body: "S3 与网关 G2 的互联协议需在供货协议中保留。",
      author: "lixiao",
      at: at.confirmed,
      resolved: false,
    },
  ],
  permissions: {
    wangyun: {
      product_specs: "admin",
      channel_sales: "admin",
      "exp-dashboard": "edit",
      "exp-spec-doc": "owner",
    },
    lixiao: {
      product_specs: "edit",
      channel_sales: "readonly",
      "exp-dashboard": "readonly",
      "exp-spec-doc": "edit",
    },
    chenmo: {
      product_specs: "readonly",
      channel_sales: "edit",
      "exp-dashboard": "edit",
      "exp-spec-doc": "readonly",
    },
    zhouran: {
      product_specs: "readonly",
      channel_sales: "none",
      "exp-dashboard": "none",
      "exp-spec-doc": "readonly",
    },
    ai: {},
  },
  sceneTemplates: [
    {
      id: "tpl-install-v1",
      name: "装机方案 V1",
      version: "1.0",
      slots: [
        {
          id: "slot-main-lock",
          abstractType: "smart_lock",
          constraints: ["必须支持 Matter", "防护等级不低于 IP54"],
        },
      ],
    },
  ],
  expressions: [
    {
      id: "exp-dashboard",
      name: "渠道经营看板",
      viewIds: [
        "view-dashboard-bi",
        "view-dashboard-grid",
        "view-dashboard-doc",
        "view-dashboard-ana",
      ],
      defaultViewId: "view-dashboard-bi",
      defaultForm: "bi",
      activityMember: "wangyun",
      lastActivity: "续航 12→14 + 看板加卡",
    },
    {
      id: "exp-spec-doc",
      name: "智能门锁 S3 产品规格书",
      viewIds: ["view-spec-doc", "view-spec-grid"],
      defaultViewId: "view-spec-doc",
      defaultForm: "doc",
      activityMember: "wangyun",
      lastActivity: "售价同步为 ¥1,199",
    },
    {
      id: "exp-agreement",
      name: "经销商供货协议·华东",
      viewIds: ["view-agreement-doc", "view-agreement-grid"],
      defaultViewId: "view-agreement-doc",
      defaultForm: "doc",
      activityMember: "lixiao",
      lastActivity: "AI 导入新增报价合同",
    },
    {
      id: "exp-weekly",
      name: "Q3 渠道周报",
      viewIds: ["view-weekly-doc", "view-weekly-bi"],
      defaultViewId: "view-weekly-doc",
      defaultForm: "doc",
      activityMember: "chenmo",
      lastActivity: "渠道销量缓存待修复",
    },
    {
      id: "exp-portal",
      name: "全屋智能门户方案",
      viewIds: ["view-portal-canvas"],
      defaultViewId: "view-portal-canvas",
      defaultForm: "canvas",
      activityMember: "chenmo",
      lastActivity: "S3 与 G2 建立互联",
    },
    {
      id: "exp-inventory",
      name: "产品状态盘点",
      viewIds: ["view-inventory-matrix"],
      defaultViewId: "view-inventory-matrix",
      defaultForm: "matrix",
      activityMember: "wangyun",
      lastActivity: "停产列透明显示",
    },
  ],
  views: [
    {
      id: "view-dashboard-bi",
      exprId: "exp-dashboard",
      kind: "bi",
      config: {},
    },
    {
      id: "view-dashboard-grid",
      exprId: "exp-dashboard",
      kind: "grid",
      config: {},
    },
    {
      id: "view-dashboard-doc",
      exprId: "exp-dashboard",
      kind: "doc",
      config: {},
    },
    {
      id: "view-dashboard-ana",
      exprId: "exp-dashboard",
      kind: "ana",
      config: {},
    },
    { id: "view-spec-doc", exprId: "exp-spec-doc", kind: "doc", config: {} },
    { id: "view-spec-grid", exprId: "exp-spec-doc", kind: "grid", config: {} },
    {
      id: "view-agreement-doc",
      exprId: "exp-agreement",
      kind: "doc",
      config: {},
    },
    {
      id: "view-agreement-grid",
      exprId: "exp-agreement",
      kind: "grid",
      config: {},
    },
    { id: "view-weekly-doc", exprId: "exp-weekly", kind: "doc", config: {} },
    { id: "view-weekly-bi", exprId: "exp-weekly", kind: "bi", config: {} },
    {
      id: "view-portal-canvas",
      exprId: "exp-portal",
      kind: "canvas",
      config: {},
    },
    {
      id: "view-inventory-matrix",
      exprId: "exp-inventory",
      kind: "matrix",
      config: {},
    },
  ],
  docModels: [
    {
      exprId: "exp-spec-doc",
      docNo: "SPEC-2026-018",
      template: "产品规格书 V2",
      binding: { objectId: "prod-s3" },
      authorLine: "王芸 · 产品部 | 更新于今天 09:12",
      blocks: [
        {
          kind: "meta",
          items: [
            "SPEC-2026-018",
            "模板:产品规格书 V2",
            "绑定:产品规格库 › 智能门锁 S3",
          ],
        },
        {
          kind: "h1",
          text: "智能门锁 S3 产品规格书",
          refId: "ref-s3-name-title",
        },
        { kind: "h2", text: "一、定位与定价" },
        {
          kind: "paragraph",
          id: "p-position",
          inlines: [
            { kind: "text", text: "本规格书描述 " },
            { kind: "ref", refId: "ref-s3-name-position" },
            { kind: "text", text: " 的上市定位。型号 " },
            { kind: "ref", refId: "ref-s3-sku-hero" },
            { kind: "text", text: " 面向高端入户门场景,建议零售价为 " },
            { kind: "ref", refId: "ref-s3-price-spec" },
            { kind: "text", text: "。" },
          ],
        },
        {
          kind: "paragraph",
          id: "p-status",
          inlines: [
            { kind: "text", text: "当前生命周期为预售,预计上市日期为 " },
            { kind: "ref", refId: "ref-s3-launch-ai" },
            { kind: "text", text: "。" },
          ],
        },
        { kind: "h2", text: "二、关键参数" },
        {
          kind: "paragraph",
          id: "p-params",
          inlines: [
            { kind: "text", text: "核心参数包含续航 " },
            { kind: "ref", refId: "ref-s3-battery-para" },
            { kind: "text", text: " 个月、防护等级 " },
            { kind: "ref", refId: "ref-s3-rating-para" },
            { kind: "text", text: ",用于指导销售与渠道物料。" },
          ],
        },
        {
          kind: "dataTable",
          id: "table-spec",
          title: "数据表格",
          sourceLabel: "产品规格库",
          rows: [
            { label: "型号", refId: "ref-s3-sku-table" },
            { label: "建议零售价", refId: "ref-s3-price-spec" },
            { label: "电池续航", refId: "ref-s3-battery-table" },
            { label: "防护等级", refId: "ref-s3-rating-table" },
          ],
        },
        { kind: "h2", text: "三、续航与可靠性" },
        {
          kind: "paragraph",
          id: "p-reliability",
          inlines: [
            { kind: "text", text: "可靠性章节复核 " },
            { kind: "ref", refId: "ref-s3-name-position" },
            { kind: "text", text: " 的防护认证 " },
            { kind: "ref", refId: "ref-s3-rating-table" },
            { kind: "text", text: " 与续航数据 " },
            { kind: "ref", refId: "ref-s3-battery-table" },
            { kind: "text", text: "。" },
          ],
        },
        {
          kind: "paragraph",
          id: "p-dangling",
          inlines: [
            { kind: "text", text: "待重绑的上市权益字段:" },
            { kind: "ref", refId: "ref-weekly-presale-gift-dangling" },
          ],
        },
      ],
    },
  ],
  fieldRefs: [
    {
      id: "ref-s3-price-spec",
      objectId: "prod-s3",
      fieldCode: "price",
      exprId: "exp-spec-doc",
      label: "规格书售价",
      state: "fresh",
    },
    {
      id: "ref-s3-name-title",
      objectId: "prod-s3",
      fieldCode: "name",
      exprId: "exp-spec-doc",
      label: "标题产品名",
      state: "fresh",
    },
    {
      id: "ref-s3-name-position",
      objectId: "prod-s3",
      fieldCode: "name",
      exprId: "exp-spec-doc",
      label: "定位产品名",
      state: "fresh",
    },
    {
      id: "ref-s3-sku-hero",
      objectId: "prod-s3",
      fieldCode: "sku",
      exprId: "exp-spec-doc",
      label: "正文型号",
      state: "fresh",
    },
    {
      id: "ref-s3-sku-table",
      objectId: "prod-s3",
      fieldCode: "sku",
      exprId: "exp-spec-doc",
      label: "表格型号",
      state: "fresh",
    },
    {
      id: "ref-s3-battery-para",
      objectId: "prod-s3",
      fieldCode: "battery_months",
      exprId: "exp-spec-doc",
      label: "正文续航",
      state: "fresh",
    },
    {
      id: "ref-s3-battery-table",
      objectId: "prod-s3",
      fieldCode: "battery_months",
      exprId: "exp-spec-doc",
      label: "表格续航",
      state: "fresh",
    },
    {
      id: "ref-s3-rating-para",
      objectId: "prod-s3",
      fieldCode: "rating",
      exprId: "exp-spec-doc",
      label: "正文防护等级",
      state: "fresh",
    },
    {
      id: "ref-s3-rating-table",
      objectId: "prod-s3",
      fieldCode: "rating",
      exprId: "exp-spec-doc",
      label: "表格防护等级",
      state: "fresh",
    },
    {
      id: "ref-s3-price-agreement",
      objectId: "prod-s3",
      fieldCode: "price",
      exprId: "exp-agreement",
      label: "供货协议售价",
      state: "fresh",
    },
    {
      id: "ref-s3-price-weekly",
      objectId: "prod-s3",
      fieldCode: "price",
      exprId: "exp-weekly",
      label: "周报售价",
      state: "fresh",
    },
    {
      id: "ref-s3-launch-ai",
      objectId: "prod-s3",
      fieldCode: "launch_date",
      exprId: "exp-spec-doc",
      label: "上市日期",
      state: "lowConfidence",
      confidence: 0.74,
    },
    {
      id: "ref-weekly-presale-gift-dangling",
      objectId: "prod-s3",
      fieldCode: "presale_gift",
      exprId: "exp-weekly",
      label: "预售权益",
      state: "dangling",
    },
  ],
  kpis: [
    {
      id: "kpi-gmv",
      label: "本月 GMV",
      value: "¥2.4M",
      delta: "+12.4%",
      deltaSign: "up",
      sourceLabel: "渠道销量表",
      visible: true,
    },
    {
      id: "kpi-s3-orders",
      label: "S3 预售订单",
      value: "8,214",
      delta: "+38.2%",
      deltaSign: "up",
      sourceLabel: "产品规格库",
      visible: true,
    },
    {
      id: "kpi-aov",
      label: "平均客单价",
      value: "¥876",
      delta: "-2.1%",
      deltaSign: "down",
      sourceLabel: "合同台账",
      visible: true,
    },
    {
      id: "kpi-active-channels",
      label: "活跃渠道数",
      value: "42",
      delta: "+3",
      deltaSign: "up",
      sourceLabel: "渠道销量表",
      aiAdded: true,
      visible: true,
    },
  ],
  biBars: [
    { label: "线上直营", value: 6420, percent: 100, tone: "high" },
    { label: "京东", value: 4180, percent: 65, tone: "mid" },
    { label: "天猫", value: 3960, percent: 62, tone: "mid" },
    { label: "线下经销", value: 2850, percent: 44, tone: "low" },
    { label: "运营商", value: 1240, percent: 19, tone: "low" },
  ],
  rawImport: {
    text: rawImportText,
    spans: [
      rawSpan("华东经销", "primary"),
      rawSpan("门锁 S3", "primary"),
      rawSpan("1199", "change"),
      rawSpan("138****8000", "primary"),
      rawSpan("8 月 18 日", "change"),
      rawSpan("IP65", "primary"),
    ],
    semanticChips: [
      { label: "意图:报价导入", confidence: 0.95 },
      { label: "主体:智能门锁 S3", confidence: 0.92 },
      { label: "来源:供应商邮件", confidence: 0.88 },
    ],
    recent: [
      { id: "import-quote-mail", title: "供应商报价邮件", at: at.import },
      {
        id: "import-channel-cache",
        title: "渠道销量缓存表",
        at: at.validation,
      },
    ],
  },
  chatMessages: [
    {
      id: "chat-seed-ai",
      role: "ai",
      text: "可以让我改数据或改看板,所有 AI 写入都会生成可撤销的变更卡。",
    },
  ],
  checkResults: [
    {
      id: "check-xsrc-001",
      ruleCode: "XSRC-001",
      group: "跨源一致性",
      level: "error",
      detail: "渠道销量表缓存 ¥1,299 与权威售价 ¥1,199 不一致。",
      impact: ["渠道经营看板", "Q3 渠道周报"],
      fixActions: ["同步权威售价"],
    },
    {
      id: "check-ref-002",
      ruleCode: "REF-002",
      group: "引用完整性",
      level: "error",
      detail: "一处上市日期引用仍处于低置信待确认。",
      impact: ["智能门锁 S3 产品规格书"],
      fixActions: ["逐项确认"],
    },
    {
      id: "check-tpl-003",
      ruleCode: "TPL-003",
      group: "模板约束",
      level: "warning",
      detail: "全屋门户方案缺少备选网关。",
      impact: ["全屋智能门户方案"],
      fixActions: ["补充候选"],
    },
    ...Array.from(
      { length: 8 },
      (_, index): CheckResult => ({
        id: `check-passed-${index + 1}`,
        ruleCode: `PASS-${String(index + 1).padStart(3, "0")}`,
        group: "字段约束",
        level: "passed",
        detail: "规则通过。",
        impact: [],
        fixActions: [],
      }),
    ),
  ],
  changeSets: [
    {
      id: "changeset-ai-quote",
      source: "ai",
      status: "pending",
      title: "供应商报价邮件解析",
      actor: "ai",
      createdAt: at.import,
      items: [
        {
          id: "ai-price",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "prod-s3",
            fieldCode: "price",
          },
          oldValue: 1299,
          nextValue: 1199,
          confidence: 0.96,
          confirmed: true,
          applied: true,
        },
        {
          id: "ai-battery",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "prod-s3",
            fieldCode: "battery_months",
          },
          oldValue: 12,
          nextValue: 14,
          confidence: 0.92,
          confirmed: true,
          applied: true,
        },
        {
          id: "ai-rating-skip",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "prod-s3",
            fieldCode: "rating",
          },
          oldValue: "IP65",
          nextValue: "IP65",
          confidence: 0.98,
          confirmed: true,
          applied: true,
        },
        {
          id: "ai-contract",
          op: "createObject",
          target: {
            entityType: "object",
            entityId: "contract-east-s3",
          },
          objectTypeCode: "contracts",
          fields: {
            name: "华东智联 · S3 报价",
            product: "门锁 S3",
            channel: "华东经销",
            quote: 1199,
            contact: "老李 138****8000",
            amount: 880000,
          },
          confidence: 0.89,
          confirmed: true,
          applied: true,
        },
        {
          id: "ai-launch",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "prod-s3",
            fieldCode: "launch_date",
          },
          oldValue: null,
          nextValue: "2026-08-18",
          confidence: 0.74,
          needsConfirm: true,
          confirmed: false,
        },
      ],
    },
    {
      id: "changeset-manual-channel",
      source: "manual",
      status: "pending",
      title: "陈默调整线下经销销量",
      actor: "chenmo",
      createdAt: at.validation,
      items: [
        {
          id: "manual-sales",
          op: "updateField",
          target: {
            entityType: "field",
            entityId: "sales-offline-dealer",
            fieldCode: "month_sales",
          },
          oldValue: 2850,
          nextValue: 2910,
          confidence: 1,
          confirmed: true,
        },
      ],
    },
  ],
  changeEvents: [],
  activity: [
    {
      id: "act-1",
      actor: "ai",
      summary: "续航 12→14 + 看板加卡",
      tracks: ["data", "view"],
      at: at.confirmed,
    },
    {
      id: "act-2",
      actor: "wangyun",
      summary: "确认写入 ¥1,199,同步 3 篇文档",
      tracks: ["data"],
      at: at.confirmed,
    },
    {
      id: "act-3",
      actor: "ai",
      summary: "解析报价邮件:改 2 / 增 1 / 待确认 1",
      tracks: ["data"],
      at: at.import,
    },
    {
      id: "act-4",
      actor: "lixiao",
      summary: "补充 S3 与 G2 互联协议批注",
      tracks: ["view"],
      at: at.confirmed,
    },
    {
      id: "act-5",
      actor: "chenmo",
      summary: "提交线下经销销量调整审批",
      tracks: ["data"],
      at: at.validation,
    },
  ],
  outputSnapshots: [
    {
      id: "snapshot-s3-spec-1024",
      scope: "exp-spec-doc",
      createdAt: at.confirmed,
      payload: {
        title: "S3 规格书",
        summary: "已输出含 ¥1,199 售价与 14 个月续航的规格书。",
      },
    },
  ],
  plugins: [
    {
      id: "plug-retail",
      name: "渠道零售包",
      version: "1.2.0",
      enabled: true,
      forms: ["bi", "ana"],
    },
    {
      id: "plug-hardware",
      name: "硬件装机包",
      version: "0.9.0",
      enabled: false,
      forms: ["canvas"],
    },
  ],
  simScenarios: [
    {
      id: "sim-door-open",
      name: "指纹开锁链路",
      duration: 10,
      metrics: [
        { name: "平均延迟", value: "220ms" },
        { name: "成功率", value: "99.2%" },
      ],
    },
  ],
};

export function cloneDemoSeed(): DemoSeed {
  return structuredClone(demoSeed) as DemoSeed;
}
