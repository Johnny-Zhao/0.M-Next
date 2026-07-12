# 任务卡 T-US-017a — P4 批4a:校验接内核(runRuleCheck/checkResults 权威叠加 + 分享阻断并入)

- 状态:**可下发**(依赖 T-US-015 读路径 + **T-US-016 已合并**——复用 016 的 `gateway.setActor` 与「模式注入」模式;**不依赖 G1/G2**,是 017 三拆中最先可跑的一张)
- 性质:P4 批4 拆分之 **a**(校验)——批4 的 b(AI 变更集,依赖 G1)、c(审批,依赖 G2)另出;本卡只动 unisource,只读内核规则端点
- PR 要求:`Spec-Ref: docs/预研-E3-同源Mock到内核契约对接.md(§二 ruleStatus/checkResults 直映、§四 G9)、packages/views/src/api/view-client.ts(runRuleCheck/checkResults/ruleStatus,唯一权威)、packages/web/src/unisource/data/dto-mappers.ts(mapCheckResult 已存在)、docs/tasks/T-US-016-P4批3-写路径.md(审查结论:模式感知 + fire-and-forget 桥接口径)` + 自检输出段
- 序列位置:批4a;批4b/4c 接本卡的内核校验通道与模式接线

## 背景与关键决策(必读)

**校验现状(务必先读代码):**
同源校验是一套**本地 reactive 引擎**,与写路径的 gateway 抽象**完全平行、互不相通**:

- `state/validation-store.ts` 单例 `validationStore` 在构造时 `subscribe` 了 `workspaceStore`,**每次工作区变更就本地重跑** `runValidationRules(snapshot)`(11 条规则,`validation/rules.ts`),产出富 `RuleOutcome`(含 `group` 分类、`compare{authoritative,cached}` 对比面板、`fixes` 修复动作)。
- 9c 视图 `validation/validate-view.tsx` 的「立即运行」按钮调 `validationStore.runAll()`(本地);`CompareDiff` 面板、`executeFix`、`ignore` 全本地;顶栏分享阻断 `shareDisabledReason` 取 `deriveShareBlocked(本地结果)`。
- gateway 虽有 `runRuleCheck()`/`checkResults(runId)`,但**UI 从不调用**:MockGateway 本地跑规则缓存、KernelGateway 一律 `throw`。演示招牌流 **XSRC-001 缓存价 ¥1,299 ≠ 权威 ¥1,199** 就是本地规则,驱动那块 compare 面板。
- 内核侧(`view-client.ts`):`runRuleCheck(ws, actorId, objectTypeCode?)→runId`(POST /rule-commands,取 `events[0]`)、`checkResults(ws, runId, page, size)→CheckResultPage`(分页)、`ruleStatus(ws, objectIds[])→RuleStatusItem[]`。`dto-mappers.mapCheckResult` **已实现**,但内核命中很**薄**(只有 ruleCode/severity/message/objectId/fieldCode,**无** group/compare/fixes)——即 G9。

**决策 1 —— 本地引擎为主,内核校验为「权威叠加层」,不替换(本卡核心决策,审查重点)。**
内核 `checkResults` 薄(G9:无 compare/fixes/group),而本地引擎驱动招牌 XSRC-001 对比面板、修复动作、每次写入即时重评与分享阻断。**若用内核结果替换本地,会直接摧毁演示与 9c 富交互。** 故本卡:本地 reactive 引擎在两种模式下**原样保留**为 9c 主视图与即时反馈;backend 模式下额外拉取内核 `runRuleCheck→checkResults`,作为**只读权威叠加层**呈现(独立「内核校验(权威)」面板),并把内核 BLOCK 并入分享阻断。**⚠️ 这是本卡最大裁剪,替换 vs 叠加是关键取舍,请审查确认。**(与交接文档「校验接 9c 与分享阻断」的口径:9c 仍是本地富视图 + 内核权威叠加,分享阻断 = 本地 ∪ 内核 BLOCK。)

**决策 2 —— 模式感知 + 异步 fire-and-forget(对齐 016 桥接口径)。**
`validation-store` 的本地 `runAll` 仍**同步 reactive**;新增**异步** `runKernelCheck(actor)`:`gateway.setActor(actor)`→`runRuleCheck()`→`checkResults(runId)` 全页→`mapCheckResult`→写入独立 `kernelResults` 状态片 + Toast 汇总;**失败只 Toast,绝不向 UI 抛错**。gateway 经 `setKernelSource(source | null)` 由 boot 注入(kernel 模式注入、Mock/回退置 null),与 `setWriteSink` 同构。

**决策 3 —— actor 随 RoleSwitcher。**
`runKernelCheck` 前 `gateway.setActor(sessionStore.currentMemberId)`(复用 016 的 `setActor`);`viewClient.runRuleCheck` 需 actorId,KernelGateway 存 `currentActor`(构造 + `setActor` 同步)并透传。E3 §三 session→X-Actor-Id 直映。

**决策 4 —— 分享阻断并入内核 BLOCK。**
`shareDisabledReason` = 本地 `deriveShareBlocked` **∪** 「任一内核结果 level==="error"(BLOCK)且未被忽略」。本地无阻断但内核报 BLOCK → 仍禁分享,文案标「内核校验存在阻断项」。

**范围裁剪(明确排除,写清理由):**
- **不接 `ruleStatus`(逐对象灯):** 本卡只做「运行校验→命中列表」的 9c 闭环;逐对象 BLOCK/WARN/OK 灯是网格/画布的叠加,属后续视觉卡,不在此。
- **不把内核结果并进本地 `RuleOutcome` 富列表 / 不合成 compare/fixes:** 内核薄结果只读呈现,富交互仍由本地引擎产;内核结果富化属后端/views 长期(G9),本卡不动。
- **不接 AI 变更集 / 审批 / 写路径:** 属 017b(G1)/017c(G2)/016。
- **不做轮询/自动内核重校:** 内核校验仅在「立即运行」显式触发(Mock 模式即时本地不变)。

## 目标

backend 模式下,9c「立即运行」在保留本地即时富校验的同时,拉取内核 `runRuleCheck→checkResults` 作为只读权威叠加层呈现,并把内核 BLOCK 并入分享阻断;actor 随角色;**Mock 模式逐位零回归**。

## 涉及文件(封闭清单)

**改运行时**
- `packages/web/src/unisource/data/kernel-gateway.ts` —— 实装 `runRuleCheck()`(存储 actor→`viewClient.runRuleCheck(ws, currentActor, undefined)`,返回 runId)与 `checkResults(runId)`(`viewClient.checkResults` 全页循环→`mapCheckResult`→`RuleOutcome[]`);存 `private currentActor`(构造入参 + `setActor` 同步);捕获 `CommandFailure`→复用 `runWrite`/`mapCommandError` 或直接抛(校验为读,失败以 Error 交给 store toast 即可);移除这两方法的 throw 占位;其余写/AI 面维持 throw。
- `packages/web/src/unisource/state/validation-store.ts` —— 加 `KernelValidationSource`(gateway 子集:`setActor`+`runRuleCheck`+`checkResults`)+ `setKernelSource(source | null)`;`ValidationState` 加 `kernelResults: readonly RuleOutcome[]` / `kernelRunAt: string | null` / `kernelRunning: boolean`;异步 `runKernelCheck(actor)`(fire-and-forget,setActor→run→checkResults→map→写片 + `pushToast`,失败 toast);`shareDisabledReason()` 改为本地 ∪ 内核 BLOCK;本地 `runAll`/`evaluate`/reactive 订阅/`executeFix`/`ignore` **不变**;`reset` 清空 kernel 片。
- `packages/web/src/unisource/validation/validate-view.tsx` —— backend 模式(`useKernelRuntimeState().backend`):`runNow` 追加 `void validationStore.runKernelCheck(session.currentMemberId)`;主区下方渲染只读「内核校验(权威)」面板(`kernelResults` + `kernelRunAt` + 运行态),Mock 模式该面板不渲染;脚注补「内核 BLOCK 亦阻断分享」。
- `packages/web/src/unisource/boot.tsx` —— kernel 模式 `validationStore.setKernelSource(gateway)`(在 `applyDemoSeed` 后,与 `setWriteSink` 并列);Mock 与 `fallbackToMock` `setKernelSource(null)`。

**改测试**
- `packages/web/src/unisource/data/kernel-gateway.test.ts` —— 假 fetch:`runRuleCheck` 发 POST /rule-commands、带 `X-Actor-Id`、runId 取自 `events[0]`;`checkResults` 分页聚合 + `mapCheckResult` 映射;错误路径。
- `packages/web/src/unisource/state/validation-store.test.ts` —— 假 source:`runKernelCheck` 写 `kernelResults` + toast;内核 BLOCK 令 `shareDisabledReason` 非空;**无 source 时零回归**(本地 reactive 与分享阻断同前);`reset` 清 kernel 片。

**可选(需则纳入,append-only)**
- `packages/web/src/unisource/pages/preview-page.tsx` —— 「内核联调 DEV」区加「运行内核校验」按钮,便于手工联调。
- `packages/web/src/unisource/us-components.css` —— 「内核校验(权威)」面板样式,**仅追加**、token 内取色。

**守护(不改、须绿)**
- `packages/web/src/unisource/data/import-boundary.test.ts`;`gateway.ts` 接口 `runRuleCheck()/checkResults()` 签名不变(MockGateway 已实现,actor 经 `setActor` 前置,无需改签名)。

## 行为要求(逐条可测)

1. **Mock 零回归:** 无 kernel source 时,`validation-store`、9c 视图、分享阻断行为逐位同前;既有 `validation-store`/`rules`/9c 测试零改动通过;`kernelResults` 为空、面板不渲染。
2. **runKernelCheck(backend):** `setActor(current)`→`runRuleCheck()`→runId→`checkResults` 全页→`mapCheckResult`→写 `kernelResults`+`kernelRunAt`;Toast 汇总「内核校验:N 命中」。
3. **fire-and-forget:** `runKernelCheck` 不向 UI 抛错;失败→Toast(错误标题),`kernelRunning` 复位。
4. **分享阻断并入:** 本地无错但内核含 `level==="error"` 且未忽略 → `shareDisabledReason` 非空(文案标内核阻断);二者皆无 → 可分享。
5. **actor:** `runRuleCheck` 携带当前 `sessionStore.currentMemberId` 作 `X-Actor-Id`;切角色后变化(测试断言)。
6. **本地富交互不变:** XSRC-001 compare 面板、`executeFix`、`ignore`、每次写入即时重评在两种模式均不变。
7. **9c 叠加:** backend 模式渲染只读「内核校验(权威)」面板(结果 + 运行时刻);Mock 模式不渲染。

## 测试要求

vitest 共置。`kernel-gateway.test` 假 fetch 断言 rule-command 载荷/actor 头/runId 取值与 checkResults 分页映射;`validation-store.test` 假 source 覆盖行为 2–4 与无 source 零回归;`mapCheckResult` 已有测试沿用。既有测试零回归。

## 验收标准

1. `corepack pnpm verify:web` 全绿。
2. `git diff --stat main` 仅含封闭清单;CSS 若动仅 append;每步一 commit(gateway 读实装 → validation-store 叠加 → boot 接线 → 9c 面板 → 测试)。
3. 视觉:backend 模式 9c 显示「内核校验(权威)」面板;本地 compare 面板与富卡不变。
4. 手工联调链(PR 附摘录):`dev-up`→建空间→preview 种数据→`?backend=1&ws=`→9c「立即运行」→见本地富结果 + 内核权威面板 + Toast;令内核含 BLOCK(或本地 XSRC-001)→顶栏分享禁用;切角色确认 actor 头变化;去掉 `?backend` 的 Mock 全流程零回归。

## 禁止事项

- 只动 `packages/web/src/unisource/**`(+本卡 docs 卡);禁碰 views/server/workbench/contracts/scripts/architecture。
- 禁在白名单(`kernel-gateway.ts` 运行时、`dto-mappers.ts` type-only)之外 import `@m-next/views`。
- **禁用内核结果替换本地引擎**;禁把内核薄结果并进本地富 `RuleOutcome` 列表;禁合成 compare/fixes。
- 禁改 `validation-store` 本地同步 API(仅追加 kernel 片与异步 `runKernelCheck`/`setKernelSource`)。
- 禁实装:`ruleStatus` 逐对象灯、AI 变更集(017b)、审批(017c)、写路径(016)、规则创作/RunRuleCheck 之外的规则命令。
- 禁轮询/WebSocket 自动重校;内核校验仅显式触发。
- 禁新增 npm 依赖;禁 localStorage 业务数据(仅 `ui.us.*`);禁在 `us-tokens.css` 之外散写色值;CSS 随组件同 commit 且只追加。

完成后停止,等待审查。
