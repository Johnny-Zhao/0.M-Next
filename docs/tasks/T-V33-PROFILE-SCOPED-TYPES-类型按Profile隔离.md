# T-V33-PROFILE-SCOPED-TYPES — 类型身份按 Profile 隔离(三阶段·阶段一)

> ⚠️ **触及 kernel 元模型写入语义 + 含一处迁移(改三表唯一约束),人工发起红线。** 范围仍小、聚焦。
> 蓝本:`docs/设计-Profile与Stereotype类型隔离与跨域映射.md` 阶段一。前置:main。
> **修订说明**:初版误判"三表无 DB 约束/零迁移"。实测三表在 kernel 迁移里均有 `UNIQUE(workspace_id, code)`,故本卡**必须含一处迁移**改约束;否则 E2E 共存被 DB 直接挡。

## 目标 / 定位
让同一作者空间内**不同 profile(template_version)可定义同名 stereotype**——技术方案的 `requirement` 与 MBSE 的 `requirement` 各自独立。这是"可装卸多领域 / 多 profile 项目 / 跨域映射 / 复用"的共同前提,也是 DOMAIN3-LIVE 被阻塞的根因。

## 现状(已核实——修订)
- 三表身份当前为 **(workspace, code)**,且是 **DB 约束 + 应用层判定双重**:
  - `packages/kernel/.../db/migration/V1__kernel_batch1.sql`:object_type `UNIQUE (workspace_id, code)`
  - `V2__kernel_batch2.sql`:relation_type `UNIQUE (workspace_id, code)`
  - `V9__metamodel_generalization.sql`:value_type `UNIQUE (workspace_id, code)`
  - 应用层:`MetaModelRepository.objectTypeByCode/objectTypeCodeExists/relationTypeCodeExists/valueTypeByCode`(均 (workspace, code))。
- 三表均有 `template_version_id UUID **NULL**` 列(object_type/relation_type 由 V3 ALTER 加,value_type 在 V9 自带)。
- DB 为 **postgres:16**,支持 `UNIQUE NULLS NOT DISTINCT`。
- `field_def (object_type_id, code)` / `derived_field UNIQUE(object_type_id, code)` 随 object_type 隔离,**不改**。
- `rule_def` 的 `UNIQUE(workspace_id, rule_code)`(V11)**本卡不动**(见红线"已知约束")。

## 范围
- **A. 迁移(一处,改三表唯一约束)**:在**下一个未占用的全局 Flyway 版本号**(跨 kernel/engines/server 三处 migration 目录取最大 +1)新增一支迁移(置于 **kernel 模块** migration 目录,因改 kernel 表),对 object_type/relation_type/value_type:
  - `DROP CONSTRAINT <table>_workspace_id_code_key`(Postgres 默认名;不确定先 `\d <table>` 核名);
  - `ADD CONSTRAINT <table>_ws_tv_code_key UNIQUE NULLS NOT DISTINCT (workspace_id, template_version_id, code)`。
  - **迁移前置查重**:存量数据须满足新约束(同 (workspace, tv, code) 不得已有重复);不满足则停下回报、不强加。
- **B. MetaModelRepository:新增 tv 维度查询/判重重载(加性,保留旧签名给读路径)**:objectTypeByCode/objectTypeCodeExists、relationTypeCodeExists、valueTypeByCode 各加 `(…, templateVersionId, …)` 版本(SQL 加 `AND template_version_id IS NOT DISTINCT FROM ?`,兼容 tv 为 NULL)。
- **C. DefineObjectTypeHandler**:唯一性/复用判定、replay 回查、**父类型解析**改用 (workspace, command.templateVersionId, code)(父类型限本 tv,与既有 `metaParentCrossTemplate` 一致)。
- **D. DefineRelationTypeHandler / DefineValueTypeHandler**:code 判重、端点/父值类型解析按本 tv。
- **E. DefineFieldDefHandler:按需**(若 owner object_type 按 (workspace, code) 解析则同步 tv 化)。
- **F. 不改**:实例化(InstantiateWorkspace)、读模型/rm_*、视图、AiChangeRepository、`rule_def` 及其约束、ProfileLoader 公共行为(其 objectTypeId(versionId, code) 本就 tv 限定)。

## 封闭文件清单
**修改/新增**:
- `packages/kernel/src/main/resources/db/migration/V{next}__metamodel_profile_unique.sql`(改三表约束,A)
- `packages/kernel/.../internal/MetaModelRepository.java`(tv 维度重载)
- `packages/kernel/.../internal/DefineObjectTypeHandler.java`
- `packages/kernel/.../internal/DefineRelationTypeHandler.java`
- `packages/kernel/.../internal/DefineValueTypeHandler.java`
- `packages/kernel/.../internal/DefineFieldDefHandler.java`(仅当 owner 解析跨 tv)
- `packages/kernel/src/test/java/com/mnext/kernel/internal/MetaModelIntegrationTest.java`(+ 新增共存 E2E)

**零碰**:rule_def 及其约束、其它迁移、InstantiateWorkspace、ReadModelRepository/读模型、视图、前端、ProfileLoader 公共语义、领域种子。

## 红线 / 门禁
- **含一处迁移,仅改三表唯一约束为 (workspace, tv, code)(NULLS NOT DISTINCT)**;不动 rule_def、不动其它表;存量零破坏、可回滚;迁移前置查重不满足则停下回报。
- 不碰实例化/读模型/视图:单 profile 项目工作空间行为与查询完全不变(旧 (workspace, code) 重载保留)。
- **rule_def 不动(已知约束)**:本阶段两 profile 不可同名 `rule_code`(留待 META-DB-CONSTRAINTS);当前三领域规则码不撞,满足。
- 现有 demo 零回归;`corepack pnpm verify` 全绿(含后端 E2E + 迁移)。
- 分支 `feat/T-V33-profile-scoped-types` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main`(含迁移)+ 测试汇总。命中红线(须改 rule_def / 牵动实例化或读模型 / 存量不满足新约束)停下回报,不夹带。

## 验收
1. 迁移在干净库 + 既有库(室内/技术方案已种)均成功;存量数据无损。
2. 新增 kernel E2E:同一作者空间两个 template_version 各定义 code 同为 `requirement` 的 object_type、同名 value_type、同名 relation code → **均成功、各自按 tv 可查、互不覆盖**(不再被 DB 约束挡)。
3. 既有 `MetaModelIntegrationTest` 全过;同 tv 内重复 code 仍正确判重/幂等 replay;父类型/端点仍限本 tv(跨 tv 仍拒)。
4. 室内 + 技术方案 Demo 装载/实例化/视图零回归;`corepack pnpm verify` 全绿;无 rule_def diff、无实例化/读模型 diff。

## 跟进(本卡不做)
- DOMAIN3-LIVE 重新派发点亮 MBSE(本卡合入后即可)。
- 阶段二:多 profile 项目 + 映射 profile。
- META-DB-CONSTRAINTS:**仅剩 rule_def** 约束改为含 tv(三表部分已并入本卡);作者空间解耦。
