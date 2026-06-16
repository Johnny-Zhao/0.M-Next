# T-V33-BATCH2-B — 模板演化判级(ApplyTemplateVersion,含 gen-d)

蓝本:`docs/16` §4、`contracts/元模型命令契约.md` 批2 addendum。前置:batch2-a 已在 main。**kernel 域**(沿 instantiate 先例)。串行收尾。

## 范围

`ApplyTemplateVersion`(kernel):把已实例化的工作空间从 `fromVersion`(=workspace.template_version)演化到 `toVersion`。

1. 校验:`toVersion` 是该模板(workspace.template_id)的 **published** 版本;否则 `KERNEL-422-TEMPLATE-NOT-PUBLISHED`。
2. **逐项判级**(按 code 匹配 fromVersion vs toVersion 的类型定义):
   - **新增兼容(自动应用)**:新对象/值/关系类型;新可选字段;放宽约束(maxLength↑/min↓/maxLength 等);新枚举值;**新增子类型**;重定义进一步收紧。
   - **收紧阻断**:新必填字段(存量缺值);收紧约束;删字段/类型;删有引用枚举值;改 data_type;**改父类型(泛化变更)**;**重定义/值类型改为非子孙**;**父级字段改严致存量子类型实例违反**。
3. 任一收紧项 → `KERNEL-409-TEMPLATE-MIGRATION-REQUIRED` + **受影响存量清单**(扫该空间相关类型实例);否则**自动应用**:把新增兼容项落到该空间的类型副本(加新类型/值类型/字段/枚举值/子类型、放宽约束),并 `workspace.template_version = toVersion`。
4. **MVP 保守**:仅枚举的"新增兼容"自动应用;凡判不准/不在清单 → 当作收紧**阻断**(安全优先,不冒险改存量)。

## gen-d 维度(本卡并入)

复用泛化阶段逻辑:**改父类型**、**重定义协变**(子值类型须仍是子孙、约束仍更严)、**值类型链演化** —— 任一导致存量子类型实例违反即阻断。受影响扫描复用 `resolveEffectiveFields` + 字段校验风格(只读)。

## 封闭文件清单

- `packages/kernel/src/main/java/com/mnext/kernel/`:`api/metamodel/ApplyTemplateVersionCommand`;`internal/ApplyTemplateVersionHandler`;`MetaCommandServiceImpl` 路由;`MetaModelRepository`(版本间 diff/判级/受影响扫描/自动应用)、`CommandErrors`(migrationRequired 工厂,带受影响清单 details)。
- `packages/server/.../MetaCommandController.java`:路由该 commandType。
- 测试:kernel 集成测试(新增兼容自动应用成功、各类收紧阻断含**改父类型/重定义放宽/新必填**、受影响清单正确、toVersion 未发布拒)。

**无新迁移**。零碰:engines、views/web、contracts(已固定)、**rule_def(规则的复制/演化属单列跟进,见下)**、批1–3 逻辑、Simulation*。

## 红线

- AG-110 命令入口;AG-201:判级只读 + 自动应用在同一事务,失败回滚、零出站。
- 受影响扫描**纯读**(AG-105);判级器纯函数。
- AG-109:演化是批量,MVP 同步 + 受影响扫描有界(复用分页/上限)。
- 自动应用只动该空间类型副本;不碰别的工作空间。

## 门禁

`pnpm verify` 全绿 + `contracts:check` 绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,发 `git diff --stat main` + verify 结尾。

## 跟进(不在本卡,单列 server 小卡 batch2-rules)

`rule_def` 的**实例化复制**(batch2-a 跳过的)+ **演化同步**:server 侧按 **code 重解析**(模板版本 rule_def 的 scope object_type/field_def → 目标空间同 code 的 id)复制/比对。因 rule_def 是 server 表,kernel 不碰,故单列。
