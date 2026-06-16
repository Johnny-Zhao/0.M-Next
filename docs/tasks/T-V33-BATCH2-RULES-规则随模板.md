# T-V33-BATCH2-RULES — 规则随模板复制 / 演化(收官)

蓝本:`docs/16`、`docs/14`。前置:batch2-a/b/b2 + rule-3b(rule_def)在 main。**server 域**(rule_def 是 server 表,kernel 碰不了)。批2 收官。

## 背景

batch2-a 实例化、batch2-b/b2 演化都**只搬了 kernel 元模型**,没搬 `rule_def`(server 表)。本卡补上:让规则随模板一起复制/演化,模板才是"类型 + 值类型 + 规则"完整一套。

## 范围

- **实例化时复制规则**:InstantiateWorkspace 后,把该模板版本的 `rule_def`(`WHERE template_version_id=版本`)复制进新空间,scope 按 **code 重解析**(模板 rule_def 的 scope_object_type_id/scope_field_def_id → 新空间同 code 的 object_type/field_def id);新空间 rule_def 的 `template_version_id` 置 NULL,`published` 承原值。
- **演化时同步新规则**:ApplyTemplateVersion 成功(kernel 判级放行)后,把 toVersion 中**新增的规则**(rule_code 在目标空间不存在)复制进目标空间(同样 code 重解析 scope)。
  - 安全性:新增规则**不破坏存量数据**(规则不改存储,只影响后续编辑的热路径校验 + 冷路径 check_result 显示),故新增规则可直接追加,无需 migration 闸门。
  - 改动/删除的规则:MVP **不动**目标空间已有规则(保守);留作后续。

## 实现要点(关键:server 编排 kernel + rule 复制,单事务)

- 新增 server `TemplateLifecycleService`(@Transactional):`instantiate(...)` = 调 kernel meta 命令(实例化元模型)**再** `TemplateRuleCopier.copyForInstantiate(version, newWorkspaceId)`;`apply(...)` = 调 kernel apply **再** `TemplateRuleCopier.copyNewRules(toVersion, workspaceId)`。两步同一事务,失败全回滚。
- `MetaCommandController`:`InstantiateWorkspace`/`ApplyTemplateVersion` 改路由到该 service(Define/Publish 仍直达 kernel)。
- `TemplateRuleCopier`:读 rule_def + 按 code 解析 scope(读目标空间 object_type/field_def),INSERT 新 rule_def(新 id)。

## 封闭文件清单

- `packages/server/src/main/java/com/mnext/server/`:`TemplateLifecycleService`、`TemplateRuleCopier`;`MetaCommandController`(改 Instantiate/Apply 路由到 service)。
- 测试:server 集成——实例化后新空间含规则副本(scope 指向新空间 id、热路径生效);演化新增规则被复制;已有规则不被动。

零碰:kernel(只调用其 meta 命令服务,不改 kernel 代码)、engines、views/web、contracts(已固定)、迁移、批1–3、Simulation*。

## 红线 / 门禁

- AG-110 命令入口;**AG-201 实例化/演化 + 规则复制同一事务、失败回滚、零出站**;scope 重解析只读 object_type/field_def(AG-105);复制只动目标空间、scope id 闭合(无悬空、不跨空间)。
- `pnpm verify` 全绿 + `contracts:check` 绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,发 `git diff --stat main` + verify 结尾。
