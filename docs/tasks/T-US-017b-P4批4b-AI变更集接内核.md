# 任务卡 T-US-017b — P4 批4b:AI 变更集接内核(内核 aiChanges 权威旁路 + Confirm/Reject,叠加式)

- 状态:**可下发**(依赖 T-US-015 读 + **T-US-016 已合并**——脚本变更集的「接受」已经 016 写桥落内核;复用 `gateway.setActor` 与「模式注入」模式;**G1 条件式**见决策 3)
- 性质:P4 批4 拆分之 **b**(AI 变更集)。只动 unisource,只读内核 `aiChanges` + 发内核 ai-command;**不改脚本演示内容**
- PR 要求:`Spec-Ref: docs/预研-E3-同源Mock到内核契约对接.md(§三 chat-store 脚本化 AI 保留离线演示、§四 G1)、packages/views/src/api/command-client.ts(ProposeAiChange/ConfirmAiChange(itemIds)/RejectAiChange)、packages/views/src/api/view-client.ts(aiChanges/AiChangeSet/AiChangeItem)、docs/tasks/T-US-016-P4批3-写路径.md(审查结论:AI 确认经写桥已落内核)、docs/tasks/T-US-017a-P4批4a-校验接内核.md(审查结论:模式注入 + fire-and-forget 叠加口径)、docs/tasks/T-US-G1-后端-AI变更集条目级确认.md` + 自检输出段
- 序列位置:批4b;与 017a 无耦合;**G1 合入则逐项、未合则整单降级**(决策 3)

## 背景与关键决策(必读)

**AI 变更集现状(务必先读代码):**
与校验同构,AI 变更集也是一套**本地脚本**流,gateway 的 AI 面平行且未被 UI 使用:

- `state/changeset-store.ts` 单例 `changeSetStore` 持 seed 里的脚本变更集(招牌 `changeset-ai-quote`:10:18 供应商邮件解析,改2/增1/待确认1,上市日期置信 74%)。`submit`/`confirmAll`(低置信未确认项阻断)/`acceptItems(id, itemIds)`(**逐项确认,G1 的本地等价已存在**)/`reject`/`approveChangeSet`/`rejectChangeSet`。
- `applyItem` 把确认项写进 `workspaceStore.updateField/createObject`。
- 6a `import/import-view.tsx`:`changeSetStore.acceptItems("changeset-ai-quote", vm.confirmableItemIds)`;6b `state/chat-store.ts:172` 也走 `acceptItems`;审批 `access/approval-card.tsx` 走 `approveChangeSet/rejectChangeSet`(属 **017c**)。
- **关键:016 合并后,`applyItem` 的 `updateField/createObject` 在 backend 模式已经过写桥落内核**——即 **AI 确认的数据已经真写内核**。gateway 的 `proposeAiChange/confirmAiChange/rejectAiChange` 现仍 throw、UI 不调用。
- 内核侧:`CommandClient` `proposeAiChange(ws, req)`/`confirmAiChange(ws, setId, itemIds?)`(**itemIds 已在客户端,G1 后端**)/`rejectAiChange(ws, setId)`,POST /ai-commands;`ViewClient.aiChanges(ws,…)→AiChangeSet[]`(每个含 `setId/status(PROPOSED|CONFIRMED|REJECTED)/items[{itemId,seq,opType,payload,itemStatus}]`)。`dto-mappers` **无** AI 映射器。

**决策 1 —— 叠加式,复用 016(用户已拍板;仿 017a 的「不替换」)。**
脚本变更集在两种模式下**原样保留**为 6a/6b 演示与逐项确认;其「接受」经既有 `acceptItems→applyItem→workspace 写`,在 backend 模式**已由 016 写桥落内核**(数据已真,本卡不重做)。017b 只**叠加**:backend 模式读 `viewClient.aiChanges` 把**内核已提议的变更集**作只读**权威旁路**呈现,并为**内核 setId** 接 `ConfirmAiChange(itemIds)/RejectAiChange`。依据:E3 §三「chat-store 脚本化 AI…脚本模式保留为离线演示」+ 016 已承载写路径。**⚠️ 脚本 vs 内核 propose 的取舍(A/B/C)已选 A,替换式(B)不做,请审查确认。**

**决策 2 —— 模式感知 + 异步 fire-and-forget(对齐 017a/016)。**
`changeSetStore` 本地脚本 API(`submit/confirmAll/acceptItems/reject/approveChangeSet/...`)**全同步不变**;新增 `KernelChangeSetSource`(gateway 子集:`setActor`+`listAiChanges`+`confirmAiChange`+`rejectAiChange`)经 `setKernelSource(src|null)` 由 boot 注入;新增 `kernelChangeSets`/`kernelSyncAt`/`kernelBusy` 状态片;异步 `refreshKernelAiChanges()`(list→`mapAiChangeSet`→片)、`confirmKernelItems(setId, itemIds)`、`rejectKernel(setId)`(**fire-and-forget**:setActor→ai-command→刷新→Toast;失败只 Toast,绝不抛错)。

**决策 3 —— G1 条件式(据 G1 合并状态二选一,出卡时按当时状态落一个分支,另一分支留注释)。**
内核逐项确认 `confirmKernelItems` 调 `gateway.confirmAiChange(setId, itemIds)`:
- **G1 已合入** → 传 `itemIds`,内核逐项确认(未列项保持 PROPOSED,集合可续确认);
- **G1 未合入** → **降级**:`confirmAiChange(setId)`(省 `itemIds`)= 整单确认(缺省行为),UI 的逐项选择降级为「整单接受」,**PR 显式声明依赖 G1、待 G1 合入后回填 itemIds**。
客户端 `confirmAiChange` 仅在 itemIds 非空时携带该字段(command-client 现实现),故降级路径对 pre-G1 后端安全。

**决策 4 —— mapAiChangeSet 薄映射(G-gap,标注)。**
`AiChangeItem.payload` 是通用 `Record<string,unknown>`,`mapAiChangeSet` best-effort 抽 `op/target/nextValue`,`itemStatus→applied/confirmed`,`status PROPOSED→pending / CONFIRMED→resolved / REJECTED→rejected`,`source="ai"`,`actor="ai"`。旁路**只读呈现摘要**(标题 + 命中数 + 逐项 opType/状态),**不合成本地富 diff**(富 diff 仍属脚本流)。payload 富化属后端/长期。

**决策 5 —— actor 随 RoleSwitcher。** `confirm/reject/refresh` 前 `gateway.setActor(currentMemberId)`(复用 016 setActor)。

**范围裁剪(明确排除,写清理由):**
- **proposeAiChange 实装但非本卡 UI 驱动:** 为完整性在 KernelGateway 实现 `proposeAiChange`(一次 CommandClient 调),但 6a/6b **不触发**真实内核提议(那是 B 口径/未来);演示提议仍脚本。
- **6b 聊天旁路本卡从简:** 先在 6a import 落权威旁路面板;6b 聊天的内核旁路可选(需则同法追加,不强制)。
- **审批(approveChangeSet/rejectChangeSet + PENDING_CONFIRM/ChangeState + G2 投影)属 017c:** 本卡不碰。
- **不改脚本变更集内容/时间线**(剧本是法)。

## 目标

backend 模式下,6a 在保留脚本 AI 变更集演示(逐项确认经 016 落内核)的同时,读内核 `aiChanges` 作只读权威旁路,并为内核 setId 接 Confirm(itemIds,G1 条件式)/Reject;actor 随角色;**Mock 模式逐位零回归**。

## 涉及文件(封闭清单)

**改运行时**
- `packages/web/src/unisource/data/gateway.ts` —— 接口加 `listAiChanges(): Promise<readonly ChangeSet[]>`;`proposeAiChange/confirmAiChange/rejectAiChange` 签名已在,不改。
- `packages/web/src/unisource/data/kernel-gateway.ts` —— 实装 `confirmAiChange(setId, itemIds?)`→`commandClient.confirmAiChange(ws, setId, itemIds)`、`rejectAiChange(setId)`→`commandClient.rejectAiChange`、`proposeAiChange(cs)`→`commandClient.proposeAiChange`(完整性)、`listAiChanges()`→`viewClient.aiChanges`→`mapAiChangeSet[]`;移除这几方法 throw 占位;捕获 `CommandFailure`→复用 `runWrite`/`mapCommandError`。
- `packages/web/src/unisource/data/mock-gateway.ts` —— `listAiChanges()` 返回本地 `changeSets`(或空数组,保持 Mock 无内核旁路);`proposeAiChange/confirmAiChange/rejectAiChange` 现委托 ChangeSetStore 保持不变。
- `packages/web/src/unisource/data/dto-mappers.ts` —— 加 `mapAiChangeSet`(**type-only** import `AiChangeSet`/`AiChangeItem`→`ChangeSet`,决策 4)。
- `packages/web/src/unisource/state/changeset-store.ts` —— 加 `KernelChangeSetSource` + `setKernelSource(src|null)`;`ChangeSetState` 加 `kernelChangeSets: readonly ChangeSet[]`/`kernelSyncAt: string|null`/`kernelBusy: boolean`;异步 `refreshKernelAiChanges()`/`confirmKernelItems(setId, itemIds)`/`rejectKernel(setId)`(fire-and-forget + Toast);本地脚本 API 与 `applyItem` **全不变**;`reset` 清 kernel 片;`setKernelSource(null)` 清片。
- `packages/web/src/unisource/import/import-view.tsx` —— backend 模式(`useKernelRuntimeState().backend`)在脚本面板下渲染只读「内核 AI 变更集(权威)」旁路:列 `kernelChangeSets`(标题/状态/命中/逐项),每单「确认(逐项)」→`confirmKernelItems`、「拒绝」→`rejectKernel`,顶部「同步内核提议」→`refreshKernelAiChanges`;Mock 模式不渲染;脚本面板与 `confirm` 全不变。
- `packages/web/src/unisource/boot.tsx` —— kernel 模式 `changeSetStore.setKernelSource(gateway)`(与 `setWriteSink/setKernelSource(validation)` 并列)+ 可选首刷 `refreshKernelAiChanges`;Mock 与 `fallbackToMock` `setKernelSource(null)`。

**改测试**
- `packages/web/src/unisource/data/kernel-gateway.test.ts` —— 假 fetch:`confirmAiChange` 带 itemIds 发 /ai-commands、`rejectAiChange`、`listAiChanges` 读 aiChanges→map;错误路径。
- `packages/web/src/unisource/state/changeset-store.test.ts` —— 假 source:`refreshKernelAiChanges` 写片、`confirmKernelItems` 传 itemIds + 刷新 + Toast、`rejectKernel`、失败不抛;**无 source 零回归**(脚本 submit/confirmAll/acceptItems 同前);`reset`/`setKernelSource(null)` 清片。
- `packages/web/src/unisource/data/dto-mappers.test.ts` —— `mapAiChangeSet` 映射(status/itemStatus/payload 抽取)。

**可选(需则纳入,append-only、token 取色)**
- `packages/web/src/unisource/us-components.css` —— 「内核 AI 变更集」旁路面板样式(优先复用既有 import/changeset 类)。

**守护(不改、须绿)**
- `packages/web/src/unisource/data/import-boundary.test.ts`(dto-mappers 的 `AiChangeSet` 为 type-only;kernel-gateway 运行时 import 白名单内)。

## 行为要求(逐条可测)

1. **Mock 零回归:** 无 kernel source 时,`changeSetStore`、6a/6b、审批行为逐位同前;`kernelChangeSets` 空、旁路不渲染;既有测试零改动通过。
2. **脚本确认仍落内核(经 016):** backend 模式 6a「✓ 确认写入」仍 `acceptItems→applyItem→workspace 写`,由 016 写桥落内核(本卡不重做,回归验证即可)。
3. **refreshKernelAiChanges:** `setActor(current)`→`listAiChanges`→`mapAiChangeSet`→`kernelChangeSets`+`kernelSyncAt`;Toast「内核提议:N 单」。
4. **confirmKernelItems(G1 条件式):** G1 已合→`confirmAiChange(setId, itemIds)`;未合→`confirmAiChange(setId)` 整单;成功后 `refreshKernelAiChanges` + Toast;测试断言载荷分支。
5. **rejectKernel:** `rejectAiChange(setId)`→刷新→Toast。
6. **fire-and-forget:** 三个异步方法不向 UI 抛错;失败→Toast、`kernelBusy` 复位。
7. **actor:** confirm/reject/refresh 携带当前 `sessionStore.currentMemberId`(测试断言)。
8. **旁路只读且 backend-gated:** 「内核 AI 变更集(权威)」仅 backend 渲染;脚本富面板不变。

## 测试要求

vitest 共置。`kernel-gateway.test` 假 fetch 断言 ai-command 载荷(含/不含 itemIds 两分支)、aiChanges 读取与 `mapAiChangeSet`;`changeset-store.test` 假 source 覆盖行为 3–7 与无 source 零回归;`dto-mappers.test` 覆盖 `mapAiChangeSet`。既有测试零回归。

## 验收标准

1. `corepack pnpm verify:web` 全绿。
2. `git diff --stat main` 仅含封闭清单;CSS 若动仅 append;每步一 commit(gateway/mapper → changeset-store 叠加 → boot 接线 → 6a 旁路 → 测试)。
3. 视觉:backend 模式 6a 显示「内核 AI 变更集(权威)」旁路 + 确认/拒绝/同步;脚本富面板与逐项确认不变。
4. 手工联调链(PR 附摘录):`dev-up`→`?backend=1&ws=`→6a 脚本确认写入→回内核见新值(=016 回归);「同步内核提议」→(若内核有提议)见权威旁路→逐项确认/拒绝走内核→再同步见状态变化;切角色确认 actor 头;去 `?backend` Mock 全流程零回归(旁路不渲染)。**PR 注明 G1 分支:已合入=itemIds 逐项 / 未合入=整单降级。**

## 禁止事项

- 只动 `packages/web/src/unisource/**`(+本卡 docs 卡);禁碰 views/server/workbench/contracts/scripts/architecture。
- 禁在白名单(`kernel-gateway.ts` 运行时、`dto-mappers.ts` type-only)之外 import `@m-next/views`。
- **禁用内核 propose 替换脚本变更集**(B 口径);禁改脚本变更集内容/时间线;禁把内核薄结果合成本地富 diff。
- 禁改 `changeSetStore` 本地脚本 API 与 `applyItem` 的同步性/行为(仅追加 kernel 片与异步方法)。
- 禁重做 016 已承载的「确认即写内核」;禁实装审批(017c)、真实内核提议 UI(B/future)、6b 聊天旁路(可选非必)。
- 禁新增 npm 依赖;禁 localStorage 业务数据(仅 `ui.us.*`);禁在 `us-tokens.css` 之外散写色值;CSS 随组件同 commit 且只追加。

完成后停止,等待审查。
