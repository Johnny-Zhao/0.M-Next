# T-V33-VIEW-RULE-A — 视图扩展:每对象规则灯汇总(只读,零迁移)

蓝本:`docs/设计稿-视图API扩展-血缘规则维度一致性.md` ①(已确认)。**server 视图读侧 + view-client 类型**。**人发起的契约变更**(扩 view DTO,经确认)。前置:main(含 `check_result` V12 + `CheckResultRepository` + REC-E)。

定位:把每个对象当前的**规则态**(BLOCK/WARN/OK/UNKNOWN)从 `check_result` 聚合出来,经只读视图暴露,让前端图元规则灯 / 校验面板把 `ruleStatus: "TODO"` 接成真值。**纯读、零拷贝、有界、无命令、无迁移。**

## 聚合口径(已确认)
- 范围:该工作空间**最新检查批次**(`run_id` 中 `created_at` 最大的那次)。
- 对某对象:取该批次内 `object_id=该对象` 的结果,**最高 severity**:有 `BLOCK`→`BLOCK`;否则有 `WARN`→`WARN`;否则(仅 `INFO`/有结果无告警)→`OK`;该批次内**无该对象结果** → `OK`;**该工作空间从无检查批次** → `UNKNOWN`。
- 字段级(可选,本卡可只做对象级):同法按 `field_code` 聚合。

## 范围
- **A. 仓库读法**:扩 `CheckResultRepository`,加只读方法:给 workspace + objectIds,返回各对象在最新批次的聚合 severity(`UNKNOWN` 当无批次)。`JdbcTemplate` 只读查询;有界(objectIds ≤200)。
- **B. DTO**:`ViewQueryDtos.ViewObject` 增只读字段 `String ruleStatus`(取值 `BLOCK|WARN|OK|UNKNOWN`)。
- **C. 控制器**:`GET …/views/objects` 与 `…/views/objects/{id}` 填充 `ruleStatus`;新增批量 `GET /workspaces/{wid}/views/rule-status?objectIds=…`(≤200)给图面板一次拉全(返回 `{objectId, ruleStatus}[]`)。
- **D. TS 客户端**:`packages/views/src/api/view-client.ts` 的 `ViewObject` 接口加 `readonly ruleStatus: string;`,并加 `ruleStatus(workspaceId, objectIds)` 方法对应批量端点(契约面镜像,供前端消费)。

## 封闭文件清单
**修改**:`ViewQueryController.java`、`ViewQueryDtos.java`、`CheckResultRepository.java`、`packages/views/src/api/view-client.ts`、(若有)OpenAPI 契约/`OpenApiContractTest`
**新增**:`packages/server/src/test/java/com/mnext/server/RuleStatusQueryIntegrationTest.java`、(view-client)`clients.test.ts` 追加用例
**零碰**:写命令路径、kernel/engines、其它契约/迁移、recommendation/ai/import 逻辑。

## 红线 / 门禁
- **纯读**:只查 `check_result`(经 `CheckResultRepository`),**不写、不改命令、不加迁移**(AG-101/102)。
- 有界:批量 `objectIds ≤200`;聚合查询走 `check_result_object_idx`。
- 不编造:无批次 → `UNKNOWN`,不臆造 OK/BLOCK。
- 契约面变更(DTO 增字段 + 批量端点)**经本稿确认**;若有 OpenAPI 契约测试需同步更新(AG-301/501 已由确认满足)。
- `corepack pnpm verify` 全绿;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped);与其它 server e2e 错峰。
- AG-405 落盘自检;分支 `feat/T-V33-view-rule-a` 提交不合并;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- 若聚合需求超出 `check_result` 现有列、或需改 RunRuleCheck/检查写路径 → 停下回报,不夹带。

## 验收(集成测试,纯 API)
1. 建对象 + 规则 + `RunRuleCheck` 造出 BLOCK / WARN / 仅 INFO 三种情形 + 一个无结果对象 + 一个无任何检查批次的工作空间。
2. `GET …/views/objects/{id}` 与批量 `…/rule-status`:
   - 命中 BLOCK 的对象 → `ruleStatus=BLOCK`;命中 WARN(无 BLOCK)→ `WARN`;仅 INFO/有批次无该对象结果 → `OK`;无任何批次 → `UNKNOWN`。
3. **只取最新批次**:跑两次检查(旧批次 BLOCK、新批次清白)→ 对象应为 `OK`(只看最新)。
4. 批量端点有界:objectIds >200 → 拒绝(`VIEW-400` 或既有越界码);≤200 正常。
5. 回归:objects/object/recommendation 其它字段与行为不变;views 仍只读。
6. view-client:`clients.test.ts` 断言 `ruleStatus` 字段解析 + 批量方法 URL/解析。

## 跟进(本卡不做)
②a `source` 字段(读模型加列 + 投影,另卡 `T-V33-VIEW-PROV-A`)、②b 血缘端点、③ 维度集、④ 一致性比对。
