# 任务卡 T-US-014 — 同源 P4 批1:Gateway 抽象 + DTO 映射器(不接线,零 UI 变化)

- 状态:**可下发**(纯前端、零新依赖、**零 UI/行为变化**)
- PR 要求:`Spec-Ref: docs/预研-E3-同源Mock到内核契约对接.md(§二映射总表/§三缺口 G1-G10/§四适配层设计)、packages/views/src/api/view-client.ts + command-client.ts(DTO 与命令形状唯一权威)、contracts/数据内核命令与事件契约.md、contracts/AI变更集契约.md、docs/tasks/T-US-013(P2 打磨收官)` + 自检输出段
- 序列位置:P4 五卡之 **批1**;015(读路径)/016(写路径)在本卡接口上开工

## 背景与关键决策(必读)

E.3 预研已确认(用户拍板):① unisource 的 `data/kernel-gateway.ts` 与 `data/dto-mappers.ts` 两文件获得 import `@m-next/views` 白名单(其余目录禁令不变);② G1(AI 条目级确认)推后端小卡解决、G2(资源级权限)前端投影;③ P4 按五批开跑。本卡是第一批:**把"数据从哪来、写到哪去"收拢成一个接口契约**,但不动任何 UI 行为——workspace-store 的公开 API、同步性、单例、既有测试全部保持原样。这批的产出是 015/016 的地基,验收核心就一句话:**diff 不小,但应用表现零变化**。

**决策 1:接口 async-first,但本批不接 UI。** `UnisourceGateway` 全部方法返回 Promise(未来 KernelGateway 的真形状);现 UI 的 workspace-store 单例继续同步直改状态,**不注入 gateway**(异步化与 pending 态是 016 的课题,现在动它会让 12 张卡的同步语义全部返工)。本批 MockGateway 只被测试消费。
**决策 2:MockGateway = 自持 WorkspaceStore 引擎。** `data/mock-gateway.ts` 内部 `new WorkspaceStore(cloneDemoSeed())` 作为私有内存后端,接口方法 = 委托现有 store 方法 + Promise 包装。不复制业务逻辑、不与 UI 单例冲突(各持各的实例);`satisfies UnisourceGateway` 编译期保证接口全覆盖。
**决策 3:接口即文档。** `data/gateway.ts` 每个方法必须带 JSDoc 三行注记:`@kernel` 对应内核端点/命令(如 `POST /commands UpdateFields`)、`@mock` Mock 行为语义(如"同步写 + inverse 事件")、`@gap` 涉及的缺口编号(如 G8/G10;纯前端职责标 `前端职责(G6/G7)`)。这份注记就是 015/016 的施工图,写错误导后续,**审查将逐条对照预研 §二表**。
**决策 4:白名单守护 = unisource 内部测试,不碰治理文件。** 仓库级依赖表本就允许 web→views(工作台在用);收紧的是 unisource 项目规约。新增 `data/import-boundary.test.ts`:fs 扫描 `packages/web/src/unisource/**` 全部源文件,断言 `@m-next/views` 的 import(含 type-only)仅出现在 `data/kernel-gateway.ts`(本批尚不存在,列入白名单常量)与 `data/dto-mappers.ts`;同时保持既有禁令断言(`packages/web/src/workbench` 零 import)。scripts/、architecture/、AGENTS.md 一律不碰。

## 目标

新目录 `packages/web/src/unisource/data/`:接口契约(gateway.ts)+ Mock 实现(mock-gateway.ts)+ 首批 DTO 映射器(dto-mappers.ts)+ 边界守护测试;全部既有测试与 UI 表现零变化。

## 涉及文件(封闭清单,全部新增,唯一例外见 D)

**A. `data/gateway.ts` — UnisourceGateway 接口(决策 3 注记逐方法必写)**

- 载入:`loadWorkspace(): Promise<DemoSeed>`(Mock=cloneDemoSeed;kernel=objects/objectTypes/relations/history 组装,015 实现);
- 数据写面(签名 = 现 workspace-store 对应方法的参数与返回值 Promise 化):`updateField`、`updateRelationField`、`createObject`、`createRelation`、`deleteObject`(@kernel Archive+unlink)、`bindSlot`/`unbindSlot`(@kernel 预研 G5:CreateRelation/UpdateRelation(slot_binding))、`undoByEvent`(@kernel G10:objectHistory 反向值 + UpdateFields);
- 表达层写面(标注「前端职责」):`addFieldRef`/`rebindFieldRef`(G7)、`updateViewConfig`(G6)、`setKpiVisible`(G6)、`setPluginState`(纯前端注册表)、`addReviewRecord`(@kernel 近映射 annotation);
- 校验面:`runRuleCheck(): Promise<string>`(runId)、`checkResults(runId)`(@kernel 同名;Mock=validation rules 引擎包装,017 接);
- AI 面:`proposeAiChange`/`confirmAiChange(setId, itemIds?)`(**itemIds 可选参数现在就进接口**——G1 后端卡的预留形状,Mock 支持条目级即现 acceptItems 语义)/`rejectAiChange`;
- 类型全部复用 `../model/kernel` 与 `../model/view-layer`,**不引入平行类型**。

**B. `data/dto-mappers.ts`(+共置测试)— 首批四映射器(type-only import @m-next/views,白名单内)**

1. `mapViewObject(dto: ViewObject, type: ObjectTypeDef): DataObject` — fields Record→DataFieldValue(updatedBy/updatedAt 降级取对象级并注释 G8;version 直通;ruleStatus 不落对象,留校验面);
2. `mapObjectType(dto: ObjectType): ObjectTypeDef & { kernelId: string }` — code 直通 + UUID 附带(CreateObject 需要,缓存策略 015 定);FieldDefinition→FieldDef(dataType 字符串→FieldDataType 映射表,未知类型回退 text 并告警注释);
3. `mapHistoryEntry(dto: ObjectHistoryEntry): ChangeEvent` — kind 映射表(edit→data 轨字段事件,before→inverse 值;create/archive→inverse null;link/unlink→关系事件),actorDisplay→actor 解析规则注明;
4. `mapCheckResult(dto: CheckResultItem): RuleOutcome 局部` — severity `BLOCK→error/WARN→warning/OK→passed`,message/objectId/fieldCode 直通,compare/fixes 标注 017 填。
   测试夹具:按 view-client.ts 真类型手写 DTO 样例(含边界:未知 dataType/空 fields/link 类 kind/UNKNOWN severity)。

**C. `data/mock-gateway.ts`(+共置测试)— 决策 2**

- 实现接口全部方法;共置测试至少覆盖:updateField 往返(写→loadWorkspace 可见)/undoByEvent(委托 store.undo)/confirmAiChange 带 itemIds(委托 changeset acceptItems 语义——注意 Mock 端 AI 变更集在 changeset-store,允许 MockGateway 组合持有 ChangeSetStore,构造细节实现自定但接口不得外泄 store 类型)/接口覆盖 satisfies 断言。

**D. `data/import-boundary.test.ts` — 决策 4(扫描测试)**

- 唯一允许触碰目录外的动作是 **fs 只读扫描**;白名单常量 `["data/kernel-gateway.ts", "data/dto-mappers.ts"]`;断言全 unisource 源文件(含 .tsx/.ts,排除本测试自身)对 `@m-next/views` 与 `packages/web/src/workbench` 的 import 合规。

## 行为要求(逐条可测)

1. **零 UI 变化**:应用逐屏抽查与《P2 走查》任选 5 步表现一致;workspace-store 及全部既有 store 的公开 API/同步性/单例未动(diff 佐证)。
2. 既有测试全量零回归(不允许任何断言改动——本卡没有理由动它们)。
3. MockGateway 全接口可用且行为与对应 store 方法一致(委托测试);
4. dto-mappers 四映射器边界用例通过;
5. import-boundary 扫描通过,且**故意**在任意页面文件临时加 `import type {} from "@m-next/views"` 会失败(测试自证,PR 说明验证过即可,不留现场);
6. gateway.ts JSDoc 注记逐方法齐全(@kernel/@mock/@gap 三行),与预研 §二表一致。

## 测试要求(vitest 共置)

映射器边界用例(≥8);MockGateway 委托与 satisfies;边界扫描(含白名单自身豁免);gateway 接口无运行时代码(纯类型+JSDoc,若含常量需测试)。既有测试零改动零回归。

## 验收标准(机器可判 + 手工)

1. `corepack pnpm verify:web` 全绿(本机权威);tokens 门禁 0 违规(本卡无 CSS,应零触碰);
2. `git diff --stat main` 限 `packages/web/src/unisource/**`(全部新增文件 + 零修改既有文件——若实现中发现必须动既有文件,**停下来在 PR 里说明理由等审查**,不得擅动);
3. 手工:应用五屏抽查零变化;
4. 每步一 commit(建议:gateway 接口 → mappers → mock-gateway → 边界测试)。

## 禁止事项

禁止修改任何既有文件(含 workspace-store/各 store/页面/CSS/测试——发现非改不可先停);禁止实现 kernel-gateway.ts(015/016)、双模式开关(015)、异步化 UI store(016);禁止运行时 import @m-next/views 的 ViewClient/CommandClient 类(本卡 dto-mappers 仅 type-only import);禁止碰 scripts//architecture//AGENTS.md/contracts/;禁止新增 npm 依赖;禁止 localStorage(AG-102);禁止平行类型体系(复用 model/*)。完成后停止等待审查。
