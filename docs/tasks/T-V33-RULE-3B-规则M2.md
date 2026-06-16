# T-V33-RULE-3B — 规则 M2(rule_def + DefineRule/PublishRule)

蓝本:`docs/14`、`contracts/规则命令契约.md`。前置:rule-3a(engines/rules 求值器)、rule-spec 契约已在 main。**串行**(后接 rule-3c/3d,同碰 server)。

## 架构落点(关键)

`rule_def` + DefineRule/PublishRule **落 server**(非 kernel):因 `when` 解析校验需 `engines/rules`,而 kernel 不可依赖 engines。沿用 L0 仿真"server 域"先例。server 用 `engines/rules.RuleParser` 校验 `when`、用读侧(object_type/field_def)解析 scope、持久化 rule_def。kernel 不动。

## 目标

- `rule_def` 表(server 迁移)+ 仓储(INSERT/UPDATE,发布锁版)。
- `DefineRule`:校验 `when` 可解析(`RULE-400-DSL-SYNTAX-INVALID`)→ 解析 scope(objectTypeCode 存在、fieldCode 若给须属该类型有效字段,否则 `RULE-422-SCOPE-UNRESOLVED`)→ 存 draft。已发布再 Define → `RULE-409-PUBLISHED-IMMUTABLE`。
- `PublishRule`:draft → published(锁版,不可覆盖)。
- 本卡**不接命令预检、不跑检查**(热路径=3c,冷路径=3d);只做"规则的定义与发布 + 存储"。

## 封闭文件清单

- 迁移:`packages/server/src/main/resources/db/migration/V<next>__rule_def.sql`(实测 max 取下一个,应为 `V11`)。`rule_def(id, workspace_id, template_version_id, rule_code, scope_object_type_id, scope_field_def_id NULL, severity, when_src, message, impact jsonb, suggest, fix jsonb, lightweight, published, version, created_by, updated_by, created_at, updated_at; UNIQUE(workspace_id, rule_code))`。
- `packages/server/src/main/java/com/mnext/server/`:`RuleCommandController.java`(端点 `POST /workspaces/{id}/rule-commands`,X-Actor-Id;DefineRule/PublishRule 路由)、`RuleDefRepository.java`(持久化 + scope 解析读 object_type/field_def)、`RuleCommandDtos.java`、`RuleCommandException.java`(承 SimulationException 风格,code→HTTP)。
- 复用 `engines/rules.RuleParser` 解析 `when`(server 已依赖 engines);复用 `CommandErrorHandler` 的 code→HTTP 映射(`error.code().split("-")[1]`)——给它加一个 `RuleCommandException` handler(一处,镜像 SimulationException)。
- 测试:`packages/server/src/test/...RuleCommand*IntegrationTest`(Testcontainers)。

**零碰**:kernel(纯读其表即可,不改 kernel 代码)、engines(只调用 RuleParser,不改)、views/web、contracts(已固定)、其它迁移、批1–3。

## 校验与错误码(rule-spec 已登记)

- `when` 解析失败 → `RULE-400-DSL-SYNTAX-INVALID`(返回位置)。
- scope.objectTypeCode 不存在 / fieldCode 不属该类型有效字段 → `RULE-422-SCOPE-UNRESOLVED`。
- 已发布规则再 Define → `RULE-409-PUBLISHED-IMMUTABLE`。
- scope 命中"该类型及其所有子类型"由 3c/3d 解析时用(本卡只存 scope_object_type_id;子孙闭包在检查时算)。

## 红线 / 门禁

- AG-110 不适用于核心主数据以外;规则是治理配置,经命令入口、幂等、审计字段(AG-321)。
- AG-201 事务内零出站;RuleParser 解析是纯 CPU、无 IO。
- `RuleDefRepository` 的 scope 解析**只读** object_type/field_def(AG-105 风格)。
- 落盘防截断自检;`pnpm verify` 全绿 + `contracts:check` 绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。
- 完成停,先发 `git diff --stat main` + verify 结尾。
