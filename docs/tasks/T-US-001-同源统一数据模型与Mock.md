# 任务卡 T-US-001 — 同源前端:统一数据模型 + Mock 数据源 + 状态store

- 状态:**可下发**(纯前端、零新依赖、无契约门、不触后端)
- PR 要求:`Spec-Ref: docs/前端实施计划-同源主版本页面集.md §C/§D/§E、docs/design/design-new/project/交接规格 Handoff Spec.dc.html §07、AGENTS.md 附录A/AG-101/102/209/301` + 自检输出段
- 依据:见下「背景与决策链」;设计交接包在 `docs/design/design-new/project/`
- 后续卡预告:T-US-002 起为剧本主线 8 屏(首页/表格/文档/分屏/AI导入/AI对话/校验/权限),全部消费本卡产出的 store

## 背景与决策链(为什么是现在这个做法,必读)

1. **同源 UniSource 是什么**:Claude Design 交接的全新产品界面(「统一数据源文档生成工具」),14 屏、桌面 1440×900,全新视觉语言(墨/纸/青绿/琥珀/砖红 + IBM Plex 字族)。交接包 = 主版本页面集(14 屏)+ 设计系统 v1(Token/组件/状态)+ 交接规格(页面地图/路由/G-B-P 组件清单/Mock 边界/10 条 open issues)。归档稿「关键屏」**不交接、不得参考**。
2. **宿主决策(已定)**:不改现有工作台、不建新包 —— 在 `packages/web/src/unisource/` 建独立壳,挂 `/us/*` 路由(react-router-dom,basename=/us),`main.tsx` 按路径动态分流,两套全局样式互不加载。理由:交接规格 §07 明确「首版可全 Mock」,先把 UX 立起来,后接真后端;不动架构依赖矩阵。
3. **P0 已完成(在仓库里,先看再写)**:`us-tokens.css`(全量 Token)+ `us-components.css`、八个 primitives(Button/Input/Tabs/Badge/Panel/Drawer/Modal/Toast,`primitives/index.ts` 出口)、壳(WorkspaceHeader 48/52、AppSidebar 264、Inspector 316、两种 Layout、<1280 占位)、9 条路由骨架页、`/us/preview` 组件预览页、`scripts/check-us-tokens.mjs` Token 门禁(已接入 `verify:web`)。
4. **本卡为什么从「UI 形状」改成「内核形状」建模(关键转向)**:实施计划 §C 最初按设计稿词汇拟了 UI 形状模型(Library/Record/Expression…)。经决策改为**按 M-Next 内核术语建模**(AGENTS.md 附录A:Workspace/DataObject/DataRelation/SelectionRef/AIChangeSet…)。理由:① Mock 即未来契约,后续接真后端(views 的 ViewClient/CommandClient)时只换 Service 实现、页面零改;② 天然满足架构红线语义 —— SelectionRef 纯交互不写主数据(AG-209)、AI 写入必经变更集确认(AG-106/204)、关系是带独立版本的一等实体;③ 命名有权威依据,禁止自造同义词(AG-301/附录A)。
5. **审批建模决策(已定)**:设计稿里「陈默(人)越权改数 → 转审批」与「AI 越权 → 转审批」是同一交互。内核只有 AIChangeSet,故**通用化为 ChangeSet(source: 'manual' | 'ai')**,`AIChangeSet` 作为 source='ai' 的类型别名保留术语合规;确认/驳回/部分接受共用一套机制。
6. **消除数据源分裂**:P0 的侧栏用了临时静态 `shell/nav-data.ts`,各骨架页 chrome(头像/同步文案)也是写死的。本卡后**全应用只允许一个 Mock 数据源**,页面一律经 store 选择器取数,`nav-data.ts` 删除。

## 人工前置

1. `corepack pnpm install`(P0 给 `packages/web` 加了 `react-router-dom@7.18.1`,lockfile 尚未更新 —— 沙箱代理装不了 pnpm,需本机执行一次)。
2. 确认 P0 变更已提交/合入(`git status` 干净、`/us/preview` 可打开)后再下发本卡。

## 目标

在 `packages/web/src/unisource/` 内落地:内核形状的统一前端数据模型(15 实体 + 必要补充)、服从演示剧本时间线的唯一 Mock 种子、带 pub/sub 的 workspace/selection/changeset 三个 store、核心操作单元测试;并把 P0 全部页面/侧栏切到 store 取数。**不实现任何 P1 业务界面(表格编辑/文档引用等),只做数据底座与骨架接入。**

## 涉及文件(封闭清单)

新增,全部在 `packages/web/src/unisource/`:

- `model/kernel.ts` — 15 个必选实体(内核形状,命名严格对齐 AGENTS.md 附录A):
  `Workspace`、`SceneTemplate`(含槽位 SlotDef:抽象类型+约束,对应 8c 模板屏)、`ObjectTypeDef`(补充实体:FieldDef 的归属;「产品规格库/渠道销量表」= ObjectType,「产品中心/销售中心」= 其 group 标签,对应 M2 DefineObjectType 语义)、`DataObject`(objectTypeCode/status/version/审计字段)、`FieldDef`(code/name/dataType text|number|enum|date|person|docLink/enumValues?/unit?)、`DataFieldValue`(value + fieldVersion + updatedBy/At + source manual|ai)、`RelationType`、`DataRelation`(**独立 id、relationTypeCode、sourceId/targetId、status、自有 fields: Record<string, DataFieldValue>、version、annotationIds**)、`ViewDef`(id/exprId/kind grid|doc|canvas|matrix|bi|ana/config)、`SelectionRef`(entityType 'object'|'field'|'relation' + entityId + fieldCode?)、`CheckResult`(ruleCode/group/level error|warning|passed/detail/影响面/修复动作)、`Comment`(锚点 = SelectionRef 形状 + body/author/at/resolved)、`ReviewRecord`(评审流转留痕:target/action/actor/at/note)、`ChangeSet` + `ChangeItem`(见行为要求 4;导出 `type AIChangeSet = ChangeSet`(source='ai')、`type AIChangeItem = ChangeItem` 别名)、`OutputSnapshot`(id/scope/createdAt/payload 摘要)。
- `model/view-layer.ts` — 同源 UI 特有实体,与内核实体分文件:`Expression`(表达:name/viewIds/defaultViewId/lastActivity)、`FieldRef`(文档字段引用锚点:objectId+fieldCode+state fresh|justSynced|inserting|lowConfidence|dangling)、`ChangeEvent`(track 'data'|'view'、actor、viaAi、old/next、syncedRefs、**inverse**,撤销/恢复的基础)、`ActivityItem`、`Member`(五人色板)、`PluginDef`、`SimScenario`。
- `seed/demo-seed.ts` — **唯一 Mock 源**。内容与数量必须服从交接规格 §07 演示剧本:产品规格库 8 记录(S3 ¥1,199/14个月/IP65/2026-08-18 预售、S3 Lite ¥899 研发中、D2 Pro ¥599、D2 ¥399、猫眼 E1 ¥699、网关 G2 ¥199、门磁 M1 ¥79、挂锁 P1 ¥299 停产)、渠道销量表(线下经销本月 2,850,**S3 售价缓存 = ¥1,299 ≠ 权威 ¥1,199**)、合同台账(含 10:18 AI 导入新增「华东智联·S3 报价」)、客户信息库(未被引用);表达 6 个(渠道经营看板/S3 规格书/供货协议·华东/Q3 周报/全屋门户方案/产品状态盘点)+ 对应 ViewDef;成员 王芸(管理员)/李晓/陈默/周然 + 同源 AI;权限矩阵按 8b 屏;关系若干(如 全屋方案 S3—网关G2 互联,带协议字段与 1 条批注,证明关系六要素);CheckResult 11 条(2 错误 XSRC-001/REF-002、1 警告 TPL-003、8 通过);1 个 pending ChangeSet(source='ai',上市日期 74% 低置信项 needsConfirm)+ 1 个 pending ChangeSet(source='manual',陈默改线下经销销量 2,850→2,910);活动流 5 条(对应首页 8a);OutputSnapshot ≥1(S3 规格书 10:24 输出)。
- `state/workspace-store.ts` — 单例 + `useSyncExternalStore` 绑定(仓库既有模式,禁引状态库):读选择器(`getExpressions/getObjectTypes/getObjects(typeCode)/getObject(id)/getRelations(objectId)/getFieldRefs(objectId,fieldCode)/getActivity/getCheckResults`…);写操作 `updateField(objectId, fieldCode, value, meta)`(→ fieldVersion+1、object version+1、生成 ChangeEvent(含 inverse)、广播、返回受影响 FieldRef 数)、`createRelation/updateRelationField/unlinkRelation`(关系独立版本+批注可挂)、`undo(eventId)`(重放 inverse,数据轨恢复=一次新写入)。
- `state/selection-store.ts` — 当前 SelectionRef(单选/多选集合)+ 订阅;**只存交互选择**。
- `state/changeset-store.ts` — `submit(changeSet)` / `confirmAll(id)` / `reject(id)` / `acceptItems(id, itemIds[])`(部分接受:被选项立即经 workspace-store 写路径落库,其余项保持 pending;全部处理完 → status resolved);低置信项(confidence < 0.8 或 needsConfirm)未逐项确认时 confirmAll 必须拒绝执行并给原因。
- `seed/…`、`state/…` 各自共置 `*.test.ts`。

修改:

- `shell/app-sidebar.tsx` — 表达列表/数据源树改读 workspace-store 选择器;**删除 `shell/nav-data.ts`**。
- `pages/home|source|expr|import|validate|plugins|access-page.tsx` — 面包屑名称、同步灯文案、头像组、骨架页里的示例数字全部改由 store 选择器提供(页面内不允许再出现字符串写死的业务数据;UI 文案如「P1 实现:…」除外)。
- `pages/preview-page.tsx` — 新增「数据模型 DATA MODEL」面板:展示同一份 seed 的对象数/关系数/待审批 ChangeSet 数,并放一个「确认写入 ¥1,199 演示」按钮调用 changeset-store(证明三 store 打通)。
- `docs/前端实施计划-同源主版本页面集.md` — §C 替换为内核形状模型定义、§D/§E 相应更新(说明 ChangeSet 通用化与 ObjectTypeDef 补充及理由)。

## 行为要求(逐条可测)

1. **单一数据源**:全部页面/侧栏数据可追溯到 `seed/demo-seed.ts`;`grep` 不到第二处业务假数据(nav-data.ts 已删)。
2. **字段写路径**:`updateField` 后 —— DataFieldValue.fieldVersion+1、DataObject.version+1、产生 1 条 ChangeEvent(track='data'、含可用 inverse)、订阅者收到通知、返回受影响引用数(由 seed 中 FieldRef 计算,S3 售价 = 3 篇文档)。
3. **关系六要素**:DataRelation 具备独立 id/类型/状态/自有字段/版本/批注;`updateRelationField` 只推进关系自身 version,不动两端对象 version;可对关系挂 Comment。
4. **ChangeSet 三态**:pending → confirm(全部落库)/ reject(零写入,状态 rejected)/ **acceptItems 部分接受**(被选项落库、产生对应 ChangeEvent,余项仍 pending;再次 acceptItems 处理剩余项后整单 resolved)。source='manual' 与 'ai' 走同一机制;AIChangeSet 别名可用。
5. **SelectionRef 隔离**:selection-store 任意操作(set/add/clear/切换)期间,workspace-store 状态引用不变(单测断言零写、零 ChangeEvent);切换工作空间语义 = `clear()`。
6. **剧本一致性**(seed 单测断言):权威售价 1199 且渠道销量表缓存 1299;pending AI ChangeSet 含 74% 低置信项且 needsConfirm=true;CheckResult 恰为 2 error + 1 warning + 8 passed;活动流首条为「续航 12→14 + 看板加卡」。
7. **命名红线**:标识符用附录A 术语(DataObject/DataRelation/SelectionRef…),禁止 Entity/Item/Node/Edge/Link 同义词;TS 文件 kebab-case(AG-302)。

## 测试要求(vitest,共置;禁 sleep,计时用 fake timers;不依赖 DOM)

必含:上述行为 2/3/4/5/6 各至少一组;`undo` 恢复后字段值与版本正确(恢复=新写入,version 继续 +1 而非回退);`confirmAll` 在低置信未确认时抛错/返回失败并不产生任何写入;部分接受后 `getActivity` 含对应条目。沿用「纯逻辑优先」模式,不渲染组件。

## 验收标准(机器可判)

1. `corepack pnpm verify:web` 全绿(含 architecture:check、**tokens:check**、prettier、eslint、typecheck、test、build);
2. `node scripts/check-us-tokens.mjs` 0 违规(新文件不写色值/字体字面量;model/seed/state 是纯 TS,天然无);
3. `git grep -n "nav-data" packages/web/src` 无结果;
4. `/us/preview` 数据模型面板可演示「确认写入」并看到待审批数 -1(手工验一次);
5. `git diff --stat main` 限封闭清单(`packages/web/src/unisource/**` + 计划文档);
6. 每步一 commit,PR 附自检输出。

## 禁止事项

禁止实现:P1 业务界面(DataGrid 编辑、RefChip/文档、AI 导入四步、校验中心交互、权限矩阵 UI 等 —— 那是 T-US-002+ 的活)、任何后端调用(不 import `@m-next/views` 的 ViewClient/CommandClient,其 DTO 仅可作形状参照)、路由变更、primitives/壳的视觉改动。禁止新增任何依赖;禁止 localStorage/IndexedDB 存对象/字段/关系(仅 `ui.` 前缀界面偏好,AG-102);禁止引入状态库(用类 store + useSyncExternalStore,仓库既有模式);禁止触碰 `packages/{views,shared,kernel,engines,server}`、`contracts/**`、`architecture/**`、`AGENTS.md`、现有工作台代码(`packages/web/src/` 中 unisource 之外的文件,含 styles.css/tokens.css/main.tsx)。完成后停止等待审查。
