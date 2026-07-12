# 任务卡 T-US-G1 — 后端:ConfirmAiChange 条目级确认(itemIds)

- 状态:**可下发**(后端 + 契约 + views 客户端;**不触 unisource**,前端消费在 T-US-017)
- 性质:**契约变更特批卡**——contracts/ 修改是本卡目的本身(E.3 预研 G1,用户已拍板「推后端」);向后兼容:`itemIds` 缺省 = 现行为,既有调用方零影响
- PR 要求:`Spec-Ref: docs/预研-E3-同源Mock到内核契约对接.md(§三 G1)、contracts/AI变更集契约.md(§4 现行为)、packages/server/.../AiChangeRepository.java(confirm 现实现)` + 自检输出段
- 序列位置:与 T-US-016 并行,须在 **T-US-017 下发前合入**

## 背景与关键决策(必读)

同源 6a 的招牌交互是「逐项审核 / 部分接受」:AI 提议 N 项,用户只确认其中一部分。现契约 `ConfirmAiChange` 只支持全量确认(BLOCKED 项自动 SKIPPED),前端 Mock 的 `acceptItems` 语义在真后端没有承载。前端绕行(拒绝原集+重提子集)会打断变更集血缘与审计——违背产品立身之本,故推后端。前端 gateway 接口已预留形状:`confirmAiChange(setId, itemIds?)`(T-US-014)。

**决策 1:载荷加可选 `itemIds[]`,语义 = 只确认列出的项。**
- `itemIds` 缺省/null → **现行为不变**(全量确认,BLOCKED→SKIPPED,集合→CONFIRMED);
- `itemIds` 非空 → 仅对列出的项执行既有 dry-run 预检+重放(WRITABLE/WARN→APPLIED、BLOCKED→SKIPPED);**未列出的项保持 PROPOSED**;
- 集合状态:确认后**仍存在 PROPOSED 项 → 集合保持 `PROPOSED`**(可继续下一次部分确认);全部项均已达终态(APPLIED/SKIPPED)→ 集合置 `CONFIRMED`(confirmed_by/at 记最后一次确认者);
- 校验:任一 itemId 不属于该集合 → 拒绝,错误码 **`AI-422-ITEM-NOT-IN-SET`**(新增,列入契约错误码表);空数组 → 同样拒绝(`AI-422-EMPTY-ITEM-SELECTION`,避免歧义);
- 仅 `PROPOSED` 状态的集合可部分确认(与现约束一致);对已 `CONFIRMED` 集合重复调用沿用现幂等回放。
**决策 2:幂等复用现有逐项键。** 项级重放键 `aiconfirm:{setId}:item:{seq}` 已存在(AiChangeRepository 现实现),部分确认天然不会重复写入同一项;命令级幂等:payloadHash 已含载荷(itemIds 参与哈希),同载荷重放返回首次结果,不同 itemIds 是新命令。**禁止发明新幂等机制**,在现骨架内做。
**决策 3:客户端可选参数,向后兼容。** `packages/views/src/api/command-client.ts` 的 `confirmAiChange(workspaceId, setId)` 增第三可选参 `itemIds?: readonly string[]`(载荷仅在非空时携带);既有调用零改动。

## 涉及文件(封闭清单)

**契约(特批)**
- `contracts/AI变更集契约.md` — §4 增「条目级确认」小节(决策 1 全部语义 + 两个新错误码 + 幂等说明);§5 只读查询不变(applied/skipped 计数语义覆盖部分确认后的中间态,补一句说明);
- `contracts/schemas/ai-commands.schema.json` — ConfirmAiChange payload 增可选 `itemIds`(array of uuid,`minItems:1`,`maxItems:200`,`uniqueItems:true`)。

**服务端**
- `AiCommandDtos.java` — `ConfirmAiChangeRequest` 增 `List<UUID> itemIds`(可空);
- `AiCommandController.java` — `confirmRequest` 解析 itemIds(缺省 null);
- `AiChangeRepository.java` — `confirm(...)`:决策 1 分支(过滤项/属集校验/剩余 PROPOSED 判定集合状态/两个新错误码);**Propose/Reject 与事件信封零改动**;
- `AiChangeE2EIntegrationTest.java`(或就近新增测试类)— 用例见下。

**views 客户端**
- `packages/views/src/api/command-client.ts` — 决策 3;
- `packages/views/src/api/clients.test.ts` — 载荷断言(带/不带 itemIds 两分支)。

## 行为要求(逐条可测)

1. 兼容:不带 itemIds 的确认与改动前行为逐位一致(既有集成测试零改动零回归)。
2. 部分确认:提议 2 项 → `Confirm(itemIds=[item1])` → item1=APPLIED(主数据落库)、item2 保持 PROPOSED、集合保持 PROPOSED、applied=1;再 `Confirm(itemIds=[item2])` → 集合转 CONFIRMED。
3. 部分确认含 BLOCKED 项:列出的项 dry-run 为 BLOCKED → 该项 SKIPPED、不写主数据;集合状态按剩余 PROPOSED 判定。
4. 属集校验:itemIds 含外部 UUID → `AI-422-ITEM-NOT-IN-SET`,零写入;空数组 → `AI-422-EMPTY-ITEM-SELECTION`。
5. 幂等:同载荷(同 itemIds)重放 → 返回首次结果、不重复写入;先部分后全量的交叉调用不重复应用已 APPLIED 项(项级键兜底)。
6. 权限:REVIEWER+ 约束沿用(部分确认同全量)。
7. 客户端:`confirmAiChange(ws, setId)` 载荷不含 itemIds 字段;`confirmAiChange(ws, setId, ["…"])` 载荷携带;clients.test 两分支断言。

## 测试要求

服务端集成测试覆盖行为 2–6(至少 5 用例);schema 校验用例(itemIds 空数组/超 200/重复元素被 schema 拒);views clients.test 两分支;**既有 AI 测试零改动**。

## 验收标准

1. 后端按仓库既有流程全绿(`node scripts/run-maven.mjs test` 或项目惯用命令,PR 注明);`corepack pnpm verify:web` 全绿(views 客户端改动牵动);
2. `git diff --stat main` 仅含封闭清单文件;契约文档与 schema 同 commit(契约先行),服务端次之,客户端最后;每步一 commit;
3. PR 自检段附「部分确认 → 继续确认 → CONFIRMED」的集成测试输出摘录。

## 禁止事项

禁止改 ProposeAiChange/RejectAiChange 行为与载荷;禁止改命令信封/事件信封/既有错误码语义;禁止动 kernel 包与其他 server 模块;禁止新幂等机制(复用项级键+payloadHash);禁止触碰 unisource(前端消费在 017);禁止破坏向后兼容(缺省路径逐位一致)。完成后停止等待审查。
