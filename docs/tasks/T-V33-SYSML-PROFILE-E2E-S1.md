# T-V33-SYSML-PROFILE-E2E(S1) — SysML profile 端到端验证

蓝本:`docs/17`。**验证卡**:用平台已就绪能力把第一个 profile 端到端跑通,顺带回归整条栈。**主体=server 集成测试 + profile 定义 + 样例 .xmi**;只在发现集成断点时补最小 glue(server 域)。

## 前置已确认

通用 `/exchange/{format}/apply` 已按 formatId 分发到适配器 + 经 CreateObject/CreateRelation(code→id 解析)写入工作空间。L1 sysml-xmi 适配器在 main。导入管线无需新建。

## 端到端流程(集成测试,Testcontainers)

1. **建模板版本**:创建 `scene_template` + `scene_template_version(draft)`(若无对应命令,测试用 SQL 直插作为 setup 前置)。
2. **授权 SysML profile**(在该 draft 版本下,经真实命令端点):
   - `DefineValueType`:`sysml_id`(parent=text);
   - `DefineObjectType`:`uml_class`(基);`sysml_block`(parent=uml_class);`sysml_requirement`(parent=uml_class);
   - `DefineFieldDef`:uml_class.`name`(必填);sysml_requirement.`req_id`(valueType=sysml_id)、`text`(必填);
   - `DefineRelationType`:`uml_association`(source/target=uml_class,many_to_many);
   - `DefineRule`:`requirement_text_required`(scope=sysml_requirement.text,BLOCK,lightweight,when=isBlank(field('text')));`PublishRule`。
3. `PublishTemplateVersion` 该版本。
4. `InstantiateWorkspace` 建项目空间(类型+值类型+继承+规则整套复制进来)。
5. **导入**:POST 样例 SysML `.xmi`(1 Block + 1 Requirement + 1 association)到 `/workspaces/{新空间}/exchange/sysml-xmi/apply`。
6. **断言**:
   - 两对象落库,类型 `sysml_block`/`sysml_requirement`,字段(name/req_id/text)对;
   - association → `uml_association` 关系,端点 IS-A(子类型对象);
   - `/views/object-types` 显示 sysml_block/sysml_requirement **含继承的 name**(来自 uml_class);
   - 良构规则:导入(或随后 UpdateFields)一个 `text` 空的 requirement → 被 `RULE-422-RULE-VIOLATION` 拦(热路径)。

## 可能暴露并需就地修的小缺口(server 域,最小改)

- 实例化复制的类型 `published` 标志:CreateObject / readModel.objectTypeId 需 published=TRUE 才解析;若实例化副本未置 published,导入会解析不到类型 → 最小修(实例化复制置 published 承原值/TRUE)。**这类断点正是 S1 的价值,发现即就地最小修并在 PR 说明。**
- 模板/版本创建:若无 CreateTemplate/Version 命令,测试 SQL 直插(setup 前置,非功能本体)。

## 封闭文件清单(预估)

- `packages/server/src/test/.../SysmlProfileE2EIntegrationTest.java`;样例 `.xmi` 测试资源。
- 若需就地修断点:对应 server 文件最小改(发现后在 PR 列出,不碰 kernel/engines 既有逻辑、不新增功能)。

零碰:kernel/engines 既有实现(只调用)、views/web、contracts、迁移(除非断点确需,需先报我)。

## 红线 / 门禁

导入经命令入口(AG-110);规则走热路径(已有);视图只读。`pnpm verify` 全绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,发 `git diff --stat main` + verify 结尾 + **列出过程中发现/修补的任何集成断点**。
