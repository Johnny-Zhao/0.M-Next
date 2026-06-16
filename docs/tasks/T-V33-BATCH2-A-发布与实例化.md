# T-V33-BATCH2-A — 模板发布 + 工作空间实例化

蓝本:`docs/16` §2/§3、`contracts/元模型命令契约.md` 批2 addendum。前置:batch2-spec 已在 main。**kernel 域**(元模型所有权,沿 DefineObjectType 先例)。串行(后接 batch2-b)。

## 范围

- `PublishTemplateVersion`(kernel):`scene_template_version` draft→published。校验:版本存在且 draft(已 published→`KERNEL-409-TEMPLATE-VERSION-IMMUTABLE`);该版本 ≥1 个 object_type(否则 `KERNEL-422-TEMPLATE-EMPTY`)。
- `InstantiateWorkspace`(kernel):仅 published 版本(否则 `KERNEL-422-TEMPLATE-NOT-PUBLISHED`);建新 workspace(`newWorkspaceId`/name/ACTIVE/template_id/template_version=version);把该版本的 **value_type → object_type → field_def → relation_type**(`WHERE template_version_id=该版本`)**复制**进新空间,**old→new UUID 重映射**所有 FK;复制后类型 `template_version_id` 置 **NULL**(溯源用 workspace.template_version)。
- **不含 rule_def 复制**(server 表,kernel 碰不了)——作为紧随跟进单列(见下"跟进"),不进本卡。
- **无新迁移**(workspace.template_id/template_version、scene_template_version 已存在;各类型表已带 template_version_id)。

## 复制与 id 重映射(关键)

读该版本全部类型 → 生成 old→new UUID 映射 → **两遍写**:先按新 id 插入,再回填重映射的 FK——`object_type.parent_type_id`、`value_type.parent_value_type_id`、`field_def.{object_type_id,value_type_id,redefines_field_def_id}`、`relation_type.{source_type,target_type}` 全部映射到新 id;新空间内不得有悬空 FK。复制是批量:MVP **同步 + 类型数上限**(超限拒,提示走冷路径——冷路径后置);环不可能(继承阶段已禁)。

## 封闭文件清单

- `packages/kernel/src/main/java/com/mnext/kernel/`:`api/metamodel/` 加 `PublishTemplateVersionCommand`/`InstantiateWorkspaceCommand`;`internal/` 加 `PublishTemplateVersionHandler`/`InstantiateWorkspaceHandler`;`MetaCommandService(Impl)` 路由;`MetaModelRepository`(读版本类型 + 批量插入新空间)、`KernelRepository`(建 workspace,若需)、`CommandErrors`(加 templateNotPublished/templateEmpty 工厂)。
- `packages/server/src/main/java/com/mnext/server/MetaCommandController.java`:路由这两个 commandType(透传到 kernel meta 命令服务)。
- 测试:kernel 单测 + server `MetaCommandControllerTest`/集成测试。

零碰:engines、views/web、contracts(已固定)、迁移、rule_def、批1–3 处理器逻辑、Simulation*。

## 红线

- AG-110:经 `/meta-commands` 命令入口;AG-201:事务内零出站(整个实例化一个事务,失败回滚)。
- 发布不可变:published 版本类型冻结(Define* 已保证)。
- id 重映射闭合(无悬空 FK)——必测。
- AG-109:实例化是批量,MVP 同步 + 上限;大模板冷路径后置。

## 测试

- Publish:draft→published 成功;空版本→`KERNEL-422-TEMPLATE-EMPTY`;已发布→`KERNEL-409-TEMPLATE-VERSION-IMMUTABLE`。
- Instantiate:未发布版本→`KERNEL-422-TEMPLATE-NOT-PUBLISHED`;published→新空间含完整类型副本,**父链/重定义/值类型引用都指向新空间内的新 id**(断言无悬空、无跨空间引用);在新空间 `CreateObject`(含继承字段)走通校验;幂等重放(同 newWorkspaceId/idempotencyKey)。

## 门禁

`pnpm verify` 全绿 + `contracts:check` 绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,发 `git diff --stat main` + verify 结尾。

## 跟进(不在本卡)

`rule_def` 复制:实例化后,server 侧按 **code 重解析**(模板版本 rule_def 的 scope object_type/field_def → 新空间同 code 的 id)复制进新空间。单列小卡 batch2-a-rules 或并入 batch2-b。
