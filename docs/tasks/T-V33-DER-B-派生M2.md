# T-V33-DER-B — 派生属性 M2(derived_field + DefineDerivedField)

蓝本:`docs/18` §2、`contracts/元模型命令契约.md` 派生 addendum。前置:der-spec + der-a 在 main。**server 域**(需 engines 解析器,同 rule_def 先例;kernel 不动)。串行(后接 der-c)。

## 范围

- `derived_field` 表(server 迁移)+ 仓储。
- `DefineDerivedField`:**用 `engines/rules.RuleParser` 解析** `derivation`(语法错→`DERIVE-400-SYNTAX-INVALID`)→ 从 AST 提取被引用字段码 → **依赖环检测**(派生 D 引用另一派生 → 边;成环→`DERIVE-409-DEPENDENCY-CYCLE`)→ code 不与本类型(含祖先)的 stored 字段/其它派生冲突(否则 `KERNEL-422-FIELD-CONSTRAINT-INVALID`)→ 落库。幂等 + 审计。published 版本下改 → 复用模板版本不可变语义。
- **不含求值、不含视图暴露、不含模板复制**(均 der-c)。

## 封闭文件清单

- 迁移:`packages/server/src/main/resources/db/migration/V<next>__derived_field.sql`(实测 max 下一个,应 `V13`):`derived_field(id, workspace_id, object_type_id, template_version_id NULL, code, name, result_type, derivation, created_by, updated_by, created_at, updated_at; UNIQUE(object_type_id, code))` + 索引 `(workspace_id, object_type_id)`。
- `packages/server/src/main/java/com/mnext/server/`:`DerivedFieldRepository`(解析+环检测+落库+查询)、`DerivedFieldDtos`、路由(`MetaCommandController` 把 `DefineDerivedField` 转到该仓储/服务);复用 `engines/rules.RuleParser` + AST(public records,server 遍历提 FieldRef);错误码经既有 code→HTTP 映射(`CommandErrorHandler`,必要时加 handler/工厂)。
- 测试:server 集成——定义成功;语法错→DERIVE-400;依赖成环(A 引 B、B 引 A)→DERIVE-409;code 撞 stored 字段→KERNEL-422;幂等重放。

零碰:kernel(只读 object_type/field_def 判 code 冲突,不改 kernel 代码)、engines(只调用 RuleParser/AST,不改)、views/web、contracts(已固定)、其它迁移、rule_def。

## 依赖环检测(关键)

对该对象类型(含祖先链)的全部派生字段建依赖图:每个派生的 derivation AST 里 `field('x')` 若 x 是派生字段则连边 D→x;新定义加入后做 DAG 环检测(DFS/拓扑)。成环 → `DERIVE-409-DEPENDENCY-CYCLE`(返回环路径)。

## 红线 / 门禁

- AG-110 命令入口;AG-201 事务内零出站(RuleParser 纯 CPU);AG-105 code 冲突检查只读 object_type/field_def/derived_field。
- 只调用 engines,不改;kernel 不依赖 engines(本卡 server 域,天然满足)。
- `pnpm verify` 全绿 + `contracts:check` 绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,发 `git diff --stat main` + verify 结尾。

## 跟进(der-c)

派生求值(构只读数据上下文→engines 按依赖序算)、视图暴露派生列、规则可引用派生、派生随模板实例化/演化复制(承 batch2-rules 模式)。
