# T-V33-META-DB-CONSTRAINTS — rule_def 唯一约束按 Profile(阶段三)

> ⚠️ 含 **Flyway 迁移(改约束)**,人工发起。蓝本:阶段三。
> **前置:PROFILE-SCOPED-TYPES 已合入。**
> **修订说明**:三表(object_type/relation_type/value_type)的唯一约束改造**已并入阶段一 PROFILE-SCOPED-TYPES**(因其是阶段一硬前提)。本卡**只剩 rule_def**。

## 目标
解除阶段一遗留的"规则码不可跨 profile 同名"限制,把 rule_def 唯一约束改为含 tv。

## 现状(已核实)
- 三表唯一约束已在阶段一改为 `UNIQUE NULLS NOT DISTINCT (workspace_id, template_version_id, code)`,**本卡不再处理**。
- `rule_def`:`packages/server/.../db/migration/V11__rule_def.sql` 有 **`UNIQUE(workspace_id, rule_code)`**——两 profile 不可同名规则码;`rule_def` 已有 `template_version_id` 列(RuleDefRepository 按 (workspace, tv, code) 操作)。
- `field_def`/`derived_field`:`UNIQUE(object_type_id, code)`,随 object_type 隔离,**不动**。

## 范围(迁移)
- **A. rule_def 约束改造**:`UNIQUE(workspace_id, rule_code)` → `UNIQUE NULLS NOT DISTINCT (workspace_id, template_version_id, rule_code)`(先 `\d rule_def` 核约束名;确认 template_version_id 列在)。解除跨 profile 同名规则码限制。**迁移前置查重**,存量不满足则停下回报。
- **B. 不改**:三表(阶段一已定)、类型身份应用层逻辑、读模型、实例化、其它领域。

## 封闭文件清单
**修改/新增**:`packages/server/.../db/migration/V{next}__rule_def_profile_unique.sql`(rule_def 在 server V11,故置 server 目录;**V{next}=全局 max+1**,跨 kernel/engines/server 三目录核,当前 max=V21)、必要时迁移前置数据校验、相关迁移 E2E。rule_def.template_version_id 已确认可空,故用 `NULLS NOT DISTINCT`。
**零碰**:应用层判定逻辑、读模型、前端、领域种子。

## 红线 / 门禁
- 迁移**存量数据零破坏、可回滚**;加约束前先确认存量满足(查重),不满足则停下回报,不强加导致迁移失败。
- rule_def 约束改造须保留既有数据;改造后旧行为(同 tv 内规则码唯一)不变。
- `corepack pnpm verify` 全绿(含迁移测试,干净库 + 既有库)。
- 分支 `feat/T-V33-meta-db-constraints` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main`(含迁移)+ 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 迁移在干净库 + 既有库(室内/技术方案/MBSE 已种)均成功;存量数据无损。
2. rule_def 允许两 profile 同名规则码、同 tv 内仍唯一。
3. 全部既有功能零回归;verify 全绿。

## 跟进(本卡不做)
AUTHOR-WS-DECOUPLE(作者空间解耦);namespace `::` 全限定名形式化。
