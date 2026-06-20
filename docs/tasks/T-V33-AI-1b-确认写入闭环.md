# T-V33-AI-1b — AI 执行层 Phase 1b:确认门 + 经命令重放写入

蓝本:`docs/AI上下文执行层-设计稿.md`(§2 流程第 6-8 步、§6 决断 4)。前置在 main(v1.47,含 AI-1a 变更集/提议/预检/Stub,RBAC-A 鉴权)。**server 域**,含 Docker e2e(与其它 server e2e 错峰)。**两个前置都已在 main**(AI-1a + RBAC-A),可发。

定位:补上 AI-1a 故意留空的"确认写入"——`ConfirmAiChange` → 逐项**经命令入口重放写入** + **REVIEWER 确认门** + 增量检查。这是"AI 提议 → 人确认 → 落正式数据(走命令、留审计版本)"闭环的最后一段。**仍然不直接写库**:确认只是把变更集的每一项当作一条真实命令重放。

## 范围

### A. ConfirmAiChange 命令(扩 `AiCommandController`)
- `POST /workspaces/{wid}/ai-commands` 的 switch 加 `ConfirmAiChange`(`{setId}`):
  1. **鉴权门**:`WorkspaceAuthorizer.require(actorId, wid, Action.REVIEW)`——确认写入需 REVIEWER+(对齐"AI 必须人确认")。
  2. 载入变更集:必须存在且 `status='PROPOSED'`(已 CONFIRMED/REJECTED → `AI-409-INVALID-STATE`)。
  3. **逐项重放**:对每个 `ai_change_item`,**确认时重新预检**(数据可能已变):规则 dry-run + 该 item 目标态——
     - `WRITABLE`/`WARN` → 经 `KernelCommandService` 按 `op_type`(本期只 `UpdateFields`)+ `payload` 重放为真实命令(发起者身份 `Actor.user(actorId)`);
     - `BLOCKED`(确认时仍触发 BLOCK)→ **跳过、不写**,记入结果 `skipped`。
  4. 成功项 `item_status=APPLIED`、跳过项 `item_status=SKIPPED`;set `status=CONFIRMED`;返回 `{applied, skipped, errors}`。
  5. 写入经命令 → **天然落审计/版本/规则热路径**(不新增写路径,AG-110)。
- 幂等:同 set 重复 Confirm → 若已 CONFIRMED 返回原结果(不重复写);命令侧 idempotencyKey 用 `aiconfirm:{setId}:item:{seq}` 派生。

### B. 数据模型(按需 `V19__ai_change_confirm.sql`)
- 若 `ai_change_set.status` / `ai_change_item.item_status` 有 CHECK 约束未含 `CONFIRMED`/`APPLIED`/`SKIPPED` → 加 V19 放开取值;**若 AI-1a 已留开放取值则不加迁移**(Codex 先查 V17 约束,按需决定,不夹带)。
- 记录 set 的 `confirmed_by`/`confirmed_at`(若 V17 未留列则 V19 补)。

### C. 读视图
- `/views/ai-changes` 返回里补 set `status=CONFIRMED`、各 item `item_status`(APPLIED/SKIPPED)与 applied/skipped 统计(扩 `AiChangeViewDtos`,只增字段)。

## 封闭文件清单
**修改**
- `packages/server/src/main/java/com/mnext/server/AiCommandController.java`(加 ConfirmAiChange 分支 + REVIEW 鉴权;Propose/Reject 不动)
- `packages/server/src/main/java/com/mnext/server/AiChangeRepository.java`(confirm:载入 PROPOSED set、逐项重预检、经 KernelCommandService 重放、标 CONFIRMED/APPLIED/SKIPPED、写结果)
- `packages/server/src/main/java/com/mnext/server/AiChangeViewDtos.java`（只增 item_status/applied/skipped 字段）
- `packages/server/src/main/java/com/mnext/server/AiChangeProjection.java`（若走事件:加 `AiChangeConfirmed` 投影 case，纯追加）
- `contracts/AI变更集契约.md`（加 ConfirmAiChange 命令 + AiChangeConfirmed 事件 + 确认语义）
- `contracts/schemas/ai-commands.schema.json`（加 ConfirmAiChange）
- `packages/server/src/test/java/com/mnext/server/AiChangeE2EIntegrationTest.java`（追加确认场景，不改既有断言）
- (按需)`packages/shared/contracts/error-codes.yaml`（若需新 AI 码;`AI-409-INVALID-STATE` 已有)

**新增(按需)**
- `packages/server/src/main/resources/db/migration/V19__ai_change_confirm.sql`（仅当 V17 约束/列不够;Codex 先查再定）
- `tests/contracts/fixtures/ai-commands/valid|invalid/confirm-*.json`（夹具随契约,AG-406）

**零碰**:kernel、engines、views/web、其它迁移/契约、Propose/Reject 既有逻辑、领域命令本体。

## 红线 / 门禁
- **写入一律经 `KernelCommandService` 命令入口**(AG-110),AI 不直接写主数据;确认门 = `WorkspaceAuthorizer.require(REVIEW)`。
- 确认时**重新预检**(不能凭提议时的旧 verdict 盲写);BLOCKED 项跳过不写。
- 增量检查走命令热路径既有机制;审计/版本由命令路径天然产生。
- 幂等:已 CONFIRMED 不重复写;idempotencyKey 派生稳定。
- 不引新依赖;契约/夹具随卡(AG-406);错误码前缀 `AI-`(AG-311)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped)。**与其它 server e2e 错峰**。
- AG-405 落盘自检;**分支 `feat/T-V33-ai-1b` 提交不合并**;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- 若确认写入需绕命令、或需改 Propose/Reject、或 RBAC REVIEW 语义不匹配——**停下回报,不夹带**。

## 验收(集成测试,纯 API,扩 AiChangeE2E)
1. 复用 AI-1a 场景:建对象(必填字段空)+ 规则;`ProposeAiChange(SUGGEST_FIELDS)` 得 setId(含 WRITABLE/WARN/BLOCKED 项)。
2. **治理工作空间 + 档位门**:先建成员;**VIEWER/AUTHOR 调 ConfirmAiChange → 403**;**REVIEWER → 200**。
3. **写入闭环(命门,与 AI-1a 反向)**:REVIEWER 确认后 → `fieldSnapshot()` **不再是空**——WRITABLE/WARN 项的建议值**已写入对象**(经命令、对象 version 递增、审计有记录);**BLOCKED 项未写**、`item_status=SKIPPED`。
4. set `status=CONFIRMED`,result `applied`/`skipped` 计数正确。
5. **幂等**:重复 Confirm 同 set → 不重复写、返回原结果。
6. **状态门**:Confirm 一个已 REJECTED 的 set → `AI-409-INVALID-STATE`。
7. **增量检查**:确认写入后,相关规则检查状态被刷新(写入触发热路径/检查)。
8. 回归:AI-1a 的 Propose/Reject/EXPLAIN 行为不变;未治理工作空间自举仍生效。

## 跟进(本卡不做)
- 逐项选择性确认(只确认勾选的 item);真实 LLM provider;更多动作;AI 变更联动 UI。
