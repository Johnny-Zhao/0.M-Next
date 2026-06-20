# T-V33-AI-1a — AI 执行层 Phase 1a:变更集模型 + 五类上下文装配 + Stub Provider + 规则预检

蓝本:`docs/AI上下文执行层-设计稿.md`(§2 流程、§6 决断、§8 五类上下文、§9 装配器实现)。前置在 main(v1.42)。**server 域 + V17 迁移 + 新契约 + AiActionProvider SPI + Stub**。含 Docker e2e——**与其它 server e2e 错峰**。**不依赖 RBAC**:本卡只做"提议 + 预检 + 只读查",**不做确认写入**(确认门 + 写入重放在 AI-1b,等 RBAC-A)。体量大,**可同分支多提交**(模型 → 装配器+stub → 命令+预检+读端点 → e2e),但**一张卡、一条分支 `feat/T-V33-ai-1a`**。

定位:把"AI 产出"约束成**可预检、可对比的变更集**,绝不直接写库(§3.4)。本卡建管道 + 五类上下文装配 + `AiActionProvider` SPI + 确定式 Stub + 规则预检;真实 LLM 不进(仅留 SPI,§7.15.3)。

## 范围

### A. 数据模型(`V17__ai_change.sql`)
- `ai_change_set`:`id uuid pk`、`workspace_id`、`action text`(SUGGEST_FIELDS)、`status text not null default 'PROPOSED'`(PROPOSED/REJECTED;CONFIRMED 留 1b)、`created_by text`、`provider text`、`context_hash text`、`created_at timestamptz default now()`。
- `ai_change_item`:`id uuid pk`、`set_id uuid`、`seq int`、`op_type text`(本卡只产 `UpdateFields`)、`payload jsonb`(命令式载荷:objectId + fields)、`precheck jsonb`(`{verdict: WRITABLE/WARN/BLOCKED, details:[...]}`)、`item_status text default 'PROPOSED'`。
- 读模型 `rm_ai_change_set` / `rm_ai_change_item`(投影,供只读查)。
- 索引 `(workspace_id, status)`、`(set_id, seq)`。

### B. AiActionProvider SPI + Stub
- `interface AiActionProvider { ProviderDescriptor descriptor(); AiResult execute(AiAction action, AiContext context); }`;`descriptor()` 返回 `{providerId, version}`。
- `StubAiActionProvider`(@Component,**确定式、零外部依赖、零网络**):对 `SUGGEST_FIELDS` —— 读 context 里选中对象的 fieldDef 中**未填的必填字段**,按"有枚举取首枚举值 / number 取 0 / text 取占位串"产出建议 `UpdateFields` item;`EXPLAIN_CHECK`(只读动作)—— 把 context 里的 check_result 拼成人类可读解释文本,**不产 item**(返回纯文本,见 D 读端点)。

### C. AiContext + AiContextAssembler(§9)
- `record AiContext(ManagementCtx, ProcessCtx, ResultCtx, InteractionCtx, SubstrateCtx, String contextHash)`,五子 record 字段见设计稿 §8。
- `AiContextAssembler.assemble(workspaceId, actorId, AiActionRequest) → AiContext`,**只读、有界**,按 §9 表取数;**1a 必填字段**:①选中对象 status + 范围内活跃 check_result;②选中类型 fieldDef + 适用 ruleDef;③选中对象字段(存储+派生,经 `DerivedEvaluator`);④SelectionRef + AiAction + instruction;⑤provider descriptor + 可重放参数 + 最小 Skill 目录(`SimEngineRegistry` 的 engineId 列表)。其余字段(role/review/audit/邻域/run/snapshot/完整 skill)1a 置空或 best-effort,**留扩展点不报错**。
- 有界:选中对象 ≤ `MAX_AI_OBJECTS=50`、check_result/派生取范围内、Skill 目录有上限。
- `contextHash` = 五子上下文规范化(键排序、稳定 JSON)→ SHA-256。

### D. 命令 + 预检 + 只读端点
- `AiCommandController`(`POST /workspaces/{wid}/ai-commands`,switch):
  - `ProposeAiChange`(`{action, selection, instruction?}`)→ assemble 上下文 → `provider.execute` → 落 `ai_change_set`(PROPOSED,带 context_hash/provider)+ items → **逐 item 规则 dry-run 预检**(对"目标态"跑派生/规则,BLOCK→`BLOCKED`、WARN→`WARN`、否则 `WRITABLE`;预检**只读、不落主数据**)→ 返回 setId。
  - `RejectAiChange`(`{setId}`)→ status=REJECTED(+ items)。
  - **不做 `ConfirmAiChange`(1b)。**
- 只读端点 `GET /workspaces/{wid}/views/ai-changes?status=&setId=`(有界)→ 变更集 + items + 预检结果。
- `EXPLAIN_CHECK`:作为 `ProposeAiChange` 的只读 action(不产 item,把解释文本放 set 的一个字段/或单独 `GET .../ai-explain?checkResultId=`——二选一,**实现选简单者并在契约写明**)。

### E. 契约(**人发起,本卡 § 为准**)
- 新 `contracts/AI变更集契约.md`(命令信封 + ProposeAiChange/RejectAiChange payload + AiContext 五类摘要 + 预检 verdict 枚举 + 事件 AiChangeProposed/Rejected)。
- 新 `contracts/schemas/ai-commands.schema.json`。
- `error-codes.yaml` 追加 `AI-400-SCHEMA-INVALID`、`AI-404-CHANGESET-NOT-FOUND`、`AI-409-IDEMPOTENCY-CONFLICT`、`AI-422-PROVIDER-FAILED`、`AI-409-INVALID-STATE`。
- `scripts/check-contracts.mjs` 注册 `ai-commands`;夹具 `tests/contracts/fixtures/ai-commands/{valid,invalid}/*.json`(AG-406)。

## 封闭文件清单

**新增**
- `packages/server/src/main/resources/db/migration/V17__ai_change.sql`
- `packages/server/src/main/java/com/mnext/server/ai/AiActionProvider.java`(SPI)
- `packages/server/src/main/java/com/mnext/server/ai/StubAiActionProvider.java`
- `packages/server/src/main/java/com/mnext/server/ai/AiContext.java`(+ 五子 record,可同文件或分文件)
- `packages/server/src/main/java/com/mnext/server/ai/AiContextAssembler.java`
- `packages/server/src/main/java/com/mnext/server/ai/SkillRegistry.java`(最小:列 engineId)
- `packages/server/src/main/java/com/mnext/server/AiCommandController.java` + `AiCommandDtos.java`
- `packages/server/src/main/java/com/mnext/server/AiChangeRepository.java`
- `packages/server/src/main/java/com/mnext/server/AiChangeQueryController.java` + `AiChangeViewDtos.java`
- `packages/server/src/main/java/com/mnext/server/AiChangeProjection.java`(或在 ReadModelProjection 追加 case——**优先独立**)
- `packages/server/src/test/java/com/mnext/server/AiChangeE2EIntegrationTest.java`
- `contracts/AI变更集契约.md`、`contracts/schemas/ai-commands.schema.json`
- `tests/contracts/fixtures/ai-commands/{valid,invalid}/*.json`

**修改**
- `packages/shared/contracts/error-codes.yaml`、`scripts/check-contracts.mjs`
- (若投影走追加方案)`ReadModelProjection.java` 纯追加 `AiChangeProposed/Rejected` case

**零碰**:kernel、engines、views/web、其它迁移/契约、领域命令本体、确认写入(1b)。

## 红线 / 门禁
- **AI 不直接写主数据**:本卡只产/存/查变更集 + 预检(只读);写入(确认重放为命令)是 1b。
- 装配器只读零副本(AG-101/102);有界(AG-202/203);预检 dry-run 不落库。
- Stub provider **确定式、无网络、无新依赖**;`AiActionProvider` 仅留 SPI,不接真实 LLM。
- 契约/错误码/夹具随卡(AG-406);前缀 `AI-`(AG-311)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped)。**与其它 server e2e 错峰**。
- AG-405 落盘自检;**分支 `feat/T-V33-ai-1a` 提交不合并**;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- 若装配器需改既有读侧签名、或预检需改规则引擎、或确认写入诱惑(那是 1b)——**停下回报,不夹带**。

## 验收(集成测试,纯 API)
1. 纯 API 建最小 profile:一个对象类型(含 1 个必填枚举字段 + 1 个必填 number 字段 + 一条 `field<阈值` 的 WARN 规则)+ 一个对象(必填字段留空)。
2. `ProposeAiChange(action=SUGGEST_FIELDS, selection=该对象)` → 返回 setId;`GET /views/ai-changes?setId=` → 看到 items(对两个空必填字段的 `UpdateFields` 建议)、每项 `precheck.verdict` 已标(如枚举建议 WRITABLE、number 建议触发 WARN 规则则标 WARN);`context_hash`、`provider` 已落。
3. **预检否决**:构造一个会触发 BLOCK 规则的建议 → 该 item `verdict=BLOCKED`(但仍只是提议,未写库——查对象字段仍为空,**证明未写入**)。
4. `EXPLAIN_CHECK`:对一个已有 check_result → 返回可读解释文本,**不产 item**。
5. `RejectAiChange(setId)` → status=REJECTED;列表按 status 过滤正确。
6. 幂等:同 idempotencyKey 重放 Propose 不重复 set;非法 action/schema → `AI-400`;不存在 setId → `AI-404`。
7. **可重放**:同一上下文两次 Propose → `context_hash` 一致(装配确定式)。

## 跟进(AI-1b,本卡不做)
- `ConfirmAiChange` → 逐 item 经命令入口重放写入(发起者身份 + **REVIEWER 确认门**,依赖 RBAC-A)→ 增量检查 + 正常审计/版本;
- 真实 LLM provider 适配器;`Retriever` SPI(资产/文档 RAG);更多动作;装配器补齐 §9"可后补"字段。
