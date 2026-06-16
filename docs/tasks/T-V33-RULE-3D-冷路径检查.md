# T-V33-RULE-3D — 冷路径全量检查(check_result + RunRuleCheck + 查询)

蓝本:`docs/14` §4/§5。前置:rule-3a/3b/3c 在 main。**串行**(收尾,碰 server)。规则 DSL 最后一块。

## 目标

- `RunRuleCheck` 命令:对给定 scope(objectTypeCode,缺省=工作空间全量)跑**全部**匹配规则(含 `lightweight=false`),把违例写入 `check_result`。
- `check_result` 表(派生输出,**非主数据**,INSERT-only),记 `runId` + `configHash`(规则集+范围指纹,可追溯)。
- `/views/check-results` 有界分页查询端点。

## 封闭文件清单

- 迁移:`packages/server/src/main/resources/db/migration/V<next>__check_result.sql`(实测 max 的下一个,应为 `V12`)。`check_result(id, workspace_id, run_id, rule_code, severity, message, object_id, field_code NULL, config_hash CHAR(64), created_at; 索引 (workspace_id, run_id)、(workspace_id, object_id))`。
- `packages/server/src/main/java/com/mnext/server/`:
  - `RuleCommandController` 增 `RunRuleCheck` 路由(承 3b);
  - `RuleCheckRunner`(冷路径:解析 scope→读读模型对象→对每对象载**全部** published 规则(scope ∈ 类型及祖先,**含 non-lightweight**)→engines/rules 求值→写 check_result;`config_hash`=SHA-256(有序规则集+scope);**无 sleep**,AG-504);
  - `CheckResultRepository`(INSERT + 查询);
  - `ViewQueryController` + 读侧查询出 `/workspaces/{id}/views/check-results?runId&page&size`(分页有界 AG-202/203)。
- 复用 `engines/rules`(不改)。复用 3c 的求值上下文构建思路(可抽公共,但**不改 3c 的热路径行为**)。
- 测试:server 集成(RunRuleCheck 全量→check_result 行;含 non-lightweight 规则被评;configHash 稳定;查询端点分页;WARN/INFO 也入库)。

**零碰**:kernel、engines(只调用)、contracts(已固定)、其它迁移、批1–3、热路径 3c 的拒断逻辑、Simulation*。

## 热/冷区别(对照 3c)

- 3c 热路径:命令预检,仅 lightweight,单对象,BLOCK 阻断写入。
- 3d 冷路径:显式触发,**全部规则**(含 non-lightweight),scope 内多对象,**只记录不阻断**(全 severity 入 check_result),异步/批量语义。

## 红线 / 门禁

- **AG-105**:check_result 是派生输出,不写主数据;求值/读取只读。
- **AG-208 风格**:config_hash 可追溯;(若基于 snapshotId 则按快照读,MVP 可基于当前读模型)。
- **AG-504**:worker 无 sleep。
- **AG-202/203**:scope 查询与结果查询有界分页。
- `pnpm verify` 全绿 + `contracts:check` 绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,发 `git diff --stat main` + verify 结尾。
