# T-V33-PLUGIN-F0 — 模板"撤下"状态(迁移 + 受治理转换,F1 的前置 enabler)

蓝本:`docs/设计稿-领域插件机制.md` §5bis 装卸(决策 B)。**人发起的 schema + 契约变更(经产品负责人确认)**——这正是 F1 命中的红线,单独成卡显式授权。**packages/kernel(表归属)+ server 守卫。** 前置:main(含 F4)。**F1 依赖本卡。**

## 为什么需要
`scene_template_version.status` 的 CHECK 仅允许 `draft`/`published`(`V3__kernel_metamodel.sql:13`)。uninstall 的"撤下"需要第三种状态。F1 已正确停在此处。本卡只补这个能力,**加法、向后兼容、可逆**。

## 范围
- **A. 迁移 `V21`**(当前最高 V20;放 kernel migration 目录,因表归 kernel;**先查无 V21 撞号**):
  - 把 `scene_template_version.status` 的 CHECK 扩为 `IN ('draft','published','withdrawn')`(DROP 旧 CONSTRAINT + ADD 新)。
  - **纯加法**:不删旧值、不改旧行;现有 draft/published 行全部仍合法。
- **B. 受治理转换(经 MetaCommandService,守 AG-110 命令入口)**:
  - `withdrawTemplateVersion(templateVersionId, actor)`:`published → withdrawn`(仅允许从 published;其它状态拒绝)。
  - `restoreTemplateVersion(templateVersionId, actor)`:`withdrawn → published`(重装恢复用)。
  - 走与现有 meta 命令同款的命令/事件路径;**不旁路命令入口直写**。
- **C. 守卫(读侧/写侧把 withdrawn 视为不可用)**:
  - `instantiateWorkspace`:目标模板版本为 withdrawn → 拒绝(明确错误码)。
  - `/views/templates`(卡③):**排除 withdrawn**(只列 published)。
  - `publishTemplateVersion`:不受影响(仍 draft→published)。
- **D. 错误码**:撤下/恢复的非法转换、对 withdrawn 实例化 → 复用现有 meta 错误码前缀(AG-311),不新造前缀。

## 封闭文件清单
**新增**:`packages/kernel/src/main/resources/db/migration/V21__template_withdrawn_status.sql`、`packages/kernel/.../metamodel/WithdrawTemplateVersionCommand.java` + `RestoreTemplateVersionCommand.java` + 对应 handler、`packages/server/src/test/java/com/mnext/server/TemplateWithdrawIntegrationTest.java`。
**修改**:`MetaCommandService.java`(加两方法)、`MetaCommandServiceImpl.java`、`InstantiateWorkspaceHandler.java`(withdrawn 守卫)、`MetaCommandController.java`(暴露两命令)、③的目录查询(排除 withdrawn)、(若有)OpenAPI 契约 + 事件 schema。
**零碰**:数据写命令、派生/规则求值、其它迁移/域。

## 红线 / 门禁
- **加法迁移**:仅扩 CHECK 枚举,**不删值、不改旧行、重放安全**;转换经命令入口(AG-110),不直写。
- 契约/事件/迁移变更**经本卡确认**;OpenAPI + 契约测试同步;不引新依赖。
- 迁移号 `V21`(先查无撞号,撞则取下一可用号)。
- `corepack pnpm verify` / server 构建全绿;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped);与其它 e2e 错峰;jacoco 不降。
- AG-405 落盘自检;分支 `feat/T-V33-plugin-f0` 提交不合并;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- 若发现需删除/改写旧状态值或非加法改动 → 停下回报。

## 验收(集成测试,纯 API)
1. 建模板版本→发布;`withdrawTemplateVersion` → status=withdrawn;`/views/templates` 不再含它;`instantiateWorkspace` 拒绝(正确错误码)。
2. **非破坏**:withdraw 前已实例化的工作空间仍可读/可改/规则灯正常。
3. `restoreTemplateVersion` → 回 published → 重新可列、可实例化。
4. 非法转换(draft 直接 withdraw、对未发布实例化)→ 拒绝。
5. 回归:draft→published 正常;旧行/旧迁移不受影响;其它视图不变。

## 跟进(本卡不做)
F1 装载器据此把 `uninstall=withdraw`、重装=`restore`;插件多版本/依赖。
