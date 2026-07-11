# E.3 预研 — 同源 UniSource:Mock → ViewClient/CommandClient 契约对接

> 状态:预研稿,待确认后拆 P4 卡序。
> 依据:`packages/views/src/api/view-client.ts` / `command-client.ts`(实读)、`contracts/*.md` 与 `contracts/schemas/*.json`(实读)、`packages/web/src/unisource/`(P0–P2 终态)。
> 结论先行:**约 70% 的 Mock 面可直接映射**(当初按"内核形状"建模的赌注成立);剩余 30% 分为「前端职责保留」与「10 个契约缺口(G1–G10)」两类;推荐以 **Gateway 双实现**做无痛切换,P4 五批完成。

## 一、真实契约面盘点

**ViewClient(读,REST)**:objects(分页)/object(详情+关系)/objectHistory(事件史:kind/fieldCode/before/after/actor/seq)/ruleStatus(BLOCK|WARN|OK)/runRuleCheck→checkResults(runId 分页)/relations/tree/matrix(关系矩阵)/syncStatus/lineage(字段血缘)/simRuns+simSeries(数值时序点)/snapshots(捕获/列表/diff)/outputs(markdown|docx|pdf|html|csv|xlsx)/aiChanges(含 items.itemStatus)/annotations(评审批注)/objectTypes(id+code+fields)/relationTypes/templates/workspaces/reusableAssemblies/mappingProfiles/exchange(json|reqif)。

**CommandClient(写,命令信封 `{commandType, workspaceId, correlationId, idempotencyKey, payload}` + `X-Actor-Id`)**:UpdateFields(**双乐观锁**:expectedObjectVersion + 可选 expectedFieldVersion)/CreateObject(objectTypeId 为 UUID,需经 objectTypes() 由 code 解析;可带 `initialState: DRAFT|PENDING_CONFIRM`)/Archive(废止 VOID,`relationPolicy:"unlink"` 连带解除)/CreateRelation/UpdateRelation/Unlink/ChangeState(状态机 `DRAFT→PENDING_CONFIRM→CONFIRMED→ISSUE→TO_FIX→FIXED→FILED`,进 CONFIRMED 有规则前置阻断 RULE-422)/SoftDelete/BatchCommand;AI 三命令(Propose/Confirm/Reject,**Confirm 需 REVIEWER+,BLOCKED 项自动 SKIPPED,无条目级选择**);评审批注三命令;RBAC(Grant/RevokeWorkspaceRole,角色 `VIEWER<AUTHOR<REVIEWER<ADMIN`)。错误:`KERNEL-409-VERSION-CONFLICT`(带 conflictingFields)/423-LOCKED/422-INVALID/`PERM-403-FIELD-DENIED`,客户端已封装 CommandFailure。

## 二、映射总表(unisource → 内核)

| unisource Mock | 内核契约 | 判定 |
|---|---|---|
| DataObject / DataFieldValue | ViewObject(fields Record + version + ruleStatus) | **直映**;字段级 updatedBy/At 缺失 → G8 |
| ObjectTypeDef / FieldDef | objectTypes()(多一层 id UUID) | **直映**(code→id 解析缓存) |
| workspace.updateField(+inverse) | UpdateFields(乐观锁);undo=读 objectHistory 反向值再发 UpdateFields | **直映**;undo 语义天然一致(Mock 的 inverse 重放=内核哲学),无 Undo 命令 → G10 |
| createObject(陈默审批链) | CreateObject `initialState:PENDING_CONFIRM` + ChangeState(REVIEWER 确认) | **升级映射**(比 Mock 的 queued ChangeSet 更正规) |
| deleteObject(删除闭环) | Archive(VOID + unlink 连带) | **直映**;引用转 dangling 仍是前端表达层行为 |
| DataRelation(独立 id/版本/字段) | CreateRelation/UpdateRelation/Unlink + RelationSummary | **直映**(当初按附录 A 建模,完全同构) |
| ChangeEvent(data 轨) | objectHistory(kind/before/after/actorDisplay/seq) | **直映**;活动流=history 聚合派生 |
| ChangeEvent(view 轨/inverseView/inverseKpi) | 无对应 | **前端职责保留** → G6 |
| validation 11 规则/deriveShareBlocked | runRuleCheck + checkResults + ruleStatus(BLOCK↔error/WARN↔warning/OK↔passed);分享阻断=存在 BLOCK | **替换**:前端规则引擎退役为演示模式专用;「忽略/例外」无后端承载 → G9 |
| ChangeSet(source:'ai')/acceptItems | aiChanges + Propose/Confirm/Reject | **直映减一**:后端无条目级部分接受 → **G1(最大缺口)** |
| ChangeSet(source:'manual') 审批 | PENDING_CONFIRM + ChangeState;ReviewRecord ↔ annotation(open/resolved) | **改道映射**(语义更强) |
| PermissionMatrix(资源级 4 档) | RBAC 工作空间级 4 角色 + 字段级 PERM-403 | **形状不合** → G2(含脱敏) |
| OutputSnapshot | snapshots + outputs(+diff/exchange 白送) | **直映** |
| 矩阵 2b(枚举分组看板) | ≠ matrix 端点(那是关系矩阵);2b 数据= objects() 前端分组,拖卡= UpdateFields | **澄清即可**(G3,非缺口) |
| SimScenario 事件链回放 | simRuns/simSeries(数值时序) | **形状不合** → G4;9b 演示回放保留前端派生 |
| SceneTemplate/SlotBinding(8c) | reusableAssemblies/placeAssembly 形状差异大 | **推荐改道**:SlotBinding → 专用 RelationType(`slot_binding`)的 DataRelation,bindSlot=CreateRelation、换绑=UpdateRelation,TPL 约束走后端规则 → G5 |
| Expression/DocModel/FieldRef(RefChip 5 态) | 无表达/文档模型;lineage 可佐证来源 | **前端职责保留** → G7 |
| Member(dept/email/avatar) | /members + RBAC | 展示字段需补齐 → G8 附带 |
| session(RoleSwitcher) | X-Actor-Id + CommandClient.setActorId | **直映** |
| chat-store 脚本化 AI | ProposeAiChange(SUGGEST_FIELDS/EXPLAIN_CHECK) | P4 后期;脚本模式保留为离线演示 |

## 三、契约缺口清单(需与后端对齐)

- **G1 AI 条目级部分接受**:6a「逐项审核/部分接受」是设计核心交互;后端 Confirm 只有全量(BLOCKED 自动 SKIPPED)。选项 a) 后端 ConfirmAiChange 增 `itemIds[]`;b) 前端把"部分接受"拆成 Reject 原集 + Propose 子集(丑,变更集血缘断);**建议 a**。
- **G2 资源级权限与脱敏**:同源的库/表达分列矩阵与「···」脱敏,后端只有空间级角色+字段级拒绝。选项 a) 后端 RBAC 扩资源维度;b) 前端把四人矩阵**投影**为空间角色(王芸 ADMIN/李晓 AUTHOR/陈默 AUTHOR(数据类型字段级 deny)/周然 VIEWER),脱敏由读接口按 actor 过滤(后端补)或前端遮罩(不安全,仅演示)。**短期 b(演示)、长期 a,文档标注安全边界**。
- **G4 仿真形状**:事件链回放 vs 数值时序。9b 的教学价值在「数据一改回放变」,该逻辑读 relations 的 protocol 字段即可在真数据上原样成立;**建议 9b 保持前端派生,simRuns/simSeries 留给未来真仿真屏**,契约不动。
- **G5 槽位绑定承载**:推荐 `slot_binding` RelationType(source=模板槽位锚对象/target=库对象),约束迁移为后端规则(DefineRule);模板本体(5 槽定义)短期仍前端 seed,长期进模板目录。
- **G6 视图配置持久化**(画布布局/KPI 可见性/view 轨版本流):后端无 user-view-config 面;**保留前端内存态**(AG-102 禁 localStorage 业务数据),提议后端排期一张 `view-config` 表(非阻塞)。
- **G7 表达/文档层**:RefChip/DocModel/@插入是同源的表达层创新,后端 lineage 只覆盖字段血缘;**长期产品决策**,P4 不动。
- **G8 字段级 updatedBy/updatedAt**:justSynced/「10:24 · 王芸 经 AI 导入」等文案依赖字段级作者;objectHistory 反查可得但 N+1;建议后端 ViewObject 增可选 `fieldMeta`。
- **G9 校验忽略/例外**:建议用 annotation(severity=waiver)承载,checkResults 消费端过滤;或后端规则运行支持 suppression 列表。
- **G10 撤销语义**:无 Undo 命令,统一为「读 history 反向值 + 新写入」;需确认连续 undo 的 expectedVersion 处理(每次重读)与冲突提示文案。

## 四、适配层设计(Gateway 双实现)

```
unisource/data/
  gateway.ts          // interface UnisourceGateway:现 workspace-store 全部读写面(约 30 方法)
  mock-gateway.ts     // 现 seed+内存逻辑原样搬入(行为零变化)
  kernel-gateway.ts   // ViewClient+CommandClient 组合;dto-mappers.ts 做 DTO→kernel-shaped 模型
  dto-mappers.ts      // ViewObject→DataObject、objectHistory→ChangeEvent(data 轨)、CheckResultItem→RuleOutcome…
```

- workspace-store(及 validation/changeset/session)改为**构造注入 gateway**;UI/VM/测试零改动 —— 这正是 P0 时选"内核形状 Mock"的兑现点。
- 模式开关:`?backend=1` 或 `VITE_US_BACKEND`;Mock 永久保留(演示/离线/测试夹具三用)。
- 错误通道:CommandFailure(409 conflictingFields)→ 统一 Toast/冲突提示(可借鉴 workbench conflict UI,**复制不 import**)。
- **治理修订提案(需你拍板)**:AG-101 现禁 unisource import `@m-next/views`;P4 需修订为「仅 `unisource/data/kernel-gateway.ts`、`dto-mappers.ts` 白名单可 import ViewClient/CommandClient,其余目录维持禁令」,守护脚本同步。

## 五、P4 分卡草案(五批,延续出卡→Codex→审查流程)

1. **T-US-014 Gateway 抽象**:接口抽取 + MockGateway 重构注入;全测试零回归(行为不变的机械重构,验收=verify 全绿+diff 审查)。
2. **T-US-015 读路径**:KernelGateway 读面(objects/objectTypes/relations/history→网格/画布/活动流/版本面板);双模式开关;dto-mappers 共置测试(夹具=契约 schema 样例)。
3. **T-US-016 写路径**:UpdateFields/CreateObject/CreateRelation/Archive + 乐观锁冲突 UI;undo=history 反向重放(G10 口径);AG-101 修订随卡落地。
4. **T-US-017 校验与 AI/审批**:runRuleCheck/checkResults/ruleStatus 接 9c 与分享阻断;aiChanges+Confirm/Reject 接 6a/6b(G1 未解则功能降级为全量确认+PR 声明);PENDING_CONFIRM+ChangeState 接 8b。
5. **T-US-018 快照/输出 + 槽位关系化**:snapshots/outputs 接导出;G5 方案落 8c;收官走查。

前置条件:本地 server 可跑(`packages/server`)+ 种子工作空间脚本;G1/G2 的后端改动若排期,可与 015/016 并行。

## 六、风险与待确认

1. **G1 是唯一伤演示叙事的缺口**(部分接受是 6a 的招牌交互),建议优先推后端加 itemIds;
2. G2 脱敏在前端遮罩仅是演示级安全,文档与 PR 都要标注;
3. objectTypes 的 code→UUID 解析、命令 idempotencyKey、X-Actor-Id 等机械差异全部收在 gateway 内,不外泄到 VM/UI;
4. 待你确认三件事:**① AG-101 白名单修订同意与否;② G1/G2 找后端排期还是前端降级;③ P4 是否按五批开跑**。
