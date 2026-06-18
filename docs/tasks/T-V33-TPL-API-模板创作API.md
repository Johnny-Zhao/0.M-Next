# T-V33-TPL-API — 模板创作 API(缺口修复)

来源:fed-3/energy e2e 暴露——**模板创作链缺"创建模板/版本"的 API 入口**。现状:`scene_template`/`scene_template_version` 只能靠测试 SQL 创建;`DefineRelationType` 无 `templateVersionId` 入参(Bus 用 SQL patch `relation_type.template_version_id`)。后果:**客户无法纯 API 创作一个 profile 模板**,与"统一底座定制成领域工具"的产品主张冲突。本卡补齐:让 profile 模板从创建到发布到实例化**全程走 API,零 SQL**。

口径:**kernel 域**(模板/关系类型是元模型,归 kernel,与既有 DefineObjectType/PublishTemplateVersion 同层)。含**契约 addendum(人发起)+ kernel 实现**。与 interp(engines)、energy(server 测试)文件不重叠,可并行;但会改 `MetaCommandController`——确认彼时无其它在飞任务改它(interp/energy 都不碰)。

## A. 契约 addendum(人发起,先于实现)

1. **新命令 `CreateTemplate`**:`payload{ code, name }` → 创建 `scene_template` + 其**草稿首版**(`scene_template_version` version=1, status=draft);返回 `templateId` + `templateVersionId`(经 CommandResult/事件)。`code` 重复→`KERNEL-409-TEMPLATE-CODE-CONFLICT`(新登记)。
2. **新命令 `CreateTemplateVersion`**:`payload{ templateId }` → 在该模板下创建**下一个草稿版本**(version=max+1, status=draft);返回 `templateVersionId`。模板不存在→`KERNEL-404-TEMPLATE-NOT-FOUND`(新登记或复用);已有未发布草稿时的策略(允许多草稿/或拒绝)→**简单起见:允许**。
3. **扩 `DefineRelationType`**:`payload` 增**可选** `templateVersionId`;给定时关系类型归属该草稿模板版本(写 `relation_type.template_version_id`),取代 Bus 的 SQL patch。published 版本不可改→`KERNEL-409-TEMPLATE-VERSION-IMMUTABLE`(已存在)。
4. 落契约文件:`contracts/元模型命令契约.md`(命令表 + 语义)、`contracts/schemas/meta-commands.schema.json`(两新命令 + relationType 加 templateVersionId,oneOf/required 相应更新)、`tests/contracts/fixtures/meta-commands/valid|invalid/*`(AG-406:create-template、create-template-version、define-relation-type-templated 各 valid + 关键 invalid)、`packages/shared/contracts/error-codes.yaml`(新错误码)。

## B. kernel 实现

- `CreateTemplateCommand` / `CreateTemplateVersionCommand`(api.metamodel)+ `MetaCommandService` 增方法。
- `CreateTemplateHandler` / `CreateTemplateVersionHandler`(kernel/internal):写 scene_template / scene_template_version,发事件,command_log 幂等(仿现有 meta 命令)。
- `DefineRelationTypeCommand` 增 `templateVersionId` 字段;`DefineRelationTypeHandler` 给定时写 `template_version_id` 并校验该版本存在且未发布。
- `MetaCommandController`(server)路由两新命令 + relationType 解析加 templateVersionId(仿现有 case)。
- 迁移:`scene_template`/`scene_template_version`/`relation_type.template_version_id` 列**应已存在**(测试 SQL 在用);若确缺列才加 kernel 迁移——**先确认,缺才加**,并说明。

## 封闭文件清单(预估,实现时以契约定稿为准)

**契约(A,人提交)**:`contracts/元模型命令契约.md`、`contracts/schemas/meta-commands.schema.json`、`tests/contracts/fixtures/meta-commands/...`(新增若干)、`packages/shared/contracts/error-codes.yaml`。

**实现(B,Codex)**:
- 新增 `packages/kernel/.../api/metamodel/CreateTemplateCommand.java`、`CreateTemplateVersionCommand.java`;
- 新增 `packages/kernel/.../internal/CreateTemplateHandler.java`、`CreateTemplateVersionHandler.java`;
- 修改 `packages/kernel/.../api/MetaCommandService.java`(+2 方法)、`DefineRelationTypeCommand.java`(+templateVersionId)、`DefineRelationTypeHandler.java`、`MetaModelRepository.java`(关系类型写入加 template_version_id;模板/版本 insert);
- 修改 `packages/server/.../MetaCommandController.java`(路由 + 解析);
- 测试:kernel `MetaModelIntegrationTest` 或新 `TemplateCreationIntegrationTest`(建模板→版本→定义类型/关系于草稿→发布→实例化,全 API);server `MetaCommandControllerTest` 加路由用例。

**零碰**:engines、views/web、其它无关迁移。

## 红线 / 门禁

- AG-110:模板/版本/关系类型写入经命令入口(handler),不绕过。
- AG-301/501:命令/错误码契约人发起 addendum(A 段),Codex 不擅自加。
- AG-406:契约夹具随契约入库。
- `pnpm verify` 全绿 + jacoco≥0.80;集成测试 Docker 起、Skipped:0。
- AG-405 落盘自检;完成发 `git diff --stat main` + 测试汇总。

## 验收
- 纯 API:`CreateTemplate` → `CreateTemplateVersion`(可选)→ `DefineObjectType/DefineFieldDef/DefineRelationType(templateVersionId)` 于草稿 → `PublishTemplateVersion` → `InstantiateWorkspace` → 业务数据 → 规则检查,**全程无 SQL**。
- `DefineRelationType` 带 templateVersionId 正确归属;published 版本改之报 IMMUTABLE。
- 既有 Bus/SysML/energy e2e 可**逐步**改为纯端点(本卡不强制改它们,留各自跟进)。

## 意义
补齐"profile 纯 API 创作"最后一环。合入后:能源工具(及任何领域 profile)可由产品/客户经 API 全程创作模板,不碰数据库;energy e2e 可删测试 SQL 脚手架转纯端点。这是从"平台能跑"到"产品能发"的关键一步。
