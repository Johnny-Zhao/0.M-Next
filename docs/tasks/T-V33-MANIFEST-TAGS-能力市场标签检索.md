# T-V33-MANIFEST-TAGS — 能力市场:行业/专业/场景标签 + 检索使能

> ⚠️ **本卡越过"契约/迁移人工发起"红线**:涉及 manifest schema 扩展、模板存储字段、Flyway 迁移、`/views/templates` 契约新增字段。**不是纯前端/纯种子,需用户明确决定是否派发。** 派发前请确认愿意引入一处契约+迁移。

蓝本:平台"能力市场按行业/专业/场景检索装载"愿景。**跨 packages/domains(manifest schema)+ packages/server(存储/迁移/端点)+ packages/views(契约类型)+ packages/web(检索 UI)。** 前置:main(已含 CAPABILITY-CATALOG 能力目录 v1;三领域 manifest)。
定位:能力目录 v1 只能按 name/code 过滤。真正的"能力市场"要能按**行业(industry)/专业(profession)/场景(scenario)**多值标签检索装载。本卡为 manifest 加声明式标签、随模板持久化、经端点暴露,并在能力目录上做标签 facet 检索。

## 现状(已核实)
- manifest(如 technical-proposal)**无** industry/profession/scenario 字段;ProfileLoader.install 解析现有 schema。
- `/views/templates` 返回 `TemplateCatalogItem`(templateId/code/name/version/.../typeOverview),**无标签**。
- 能力目录 v1(CAPABILITY-CATALOG)client 端按 name/code 过滤,已留好"标签检索"挂载位。

## 范围(分层,严格不夹带)
- **A. manifest schema(契约)**:profile.manifest.json 顶层增可选 `tags: { industry?: string[]; profession?: string[]; scenario?: string[] }`(多值、可缺省)。三领域 manifest 各补合理标签(室内=建筑装饰/室内设计/户型评估;技术方案=工程/系统设计/方案评审;MBSE=航天或装备/系统工程/验证)。
- **B. 存储 + 迁移**:模板版本存储增标签列(jsonb)或关联表;**一处 Flyway 迁移**(新增列/表,nullable/默认空,不破坏既有数据);ProfileLoader.install 落标签。
- **C. 端点契约**:`TemplateCatalogItem` 增 `tags`(同结构);`view-client` TS 类型同步;**仅新增字段,不改既有字段语义**。
- **D. 检索 UI(前端)**:能力目录加行业/专业/场景三组 facet(多选);选中即过滤(client 端按返回 tags 过滤即可,无需新端点);无标签模板归"未分类"。
- **E. 不改**:既有 TemplateCatalogItem 字段、instantiate/install 行为(除落标签)、其它领域逻辑、其它面板。

## 封闭文件清单
**修改**:三领域 `profile.manifest.json`;manifest 解析(ProfileLoader 及其 schema/record)、模板存储 + **一处** `packages/server/.../db/migration/Vxx__template_tags.sql`、`TemplateCatalogController`/`TemplateCatalogItem`、`packages/views/.../view-client.ts` 类型、`packages/web/.../capability-catalog.tsx` facet UI、相关 test。
**零碰**:写入命令语义、其它端点契约、读模型投影语义。

## 红线 / 门禁(契约卡,加严)
- **本卡含契约 + 迁移,属人工发起范畴**:迁移必须**仅新增**(nullable 列/新表),不改/不删既有列,既有数据零破坏;回滚安全。
- 端点**只增 `tags` 字段**,不动既有字段;旧前端不传 facet 时行为不变(全列出)。
- manifest `tags` 可缺省;缺省模板归"未分类",不报错。
- `corepack pnpm verify` 全绿(含后端 E2E + 迁移测试);只 add 本卡相关文件。
- 分支 `feat/T-V33-manifest-tags` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main`(**须含迁移文件**)+ 测试汇总。命中红线(改既有列/破坏数据/动写入语义)立即停下回报,不夹带。

## 验收
1. 三领域模板各带 industry/profession/scenario 标签;`/views/templates` 返回含 `tags`。
2. 能力目录三组 facet 多选过滤即时生效;无标签模板归"未分类";清空 facet 恢复全列。
3. 迁移在干净库 + 既有库均成功,既有数据无损;旧行为(不选 facet)零回归;verify 全绿。

## 跟进(本卡不做)
能力市场服务端全文/标签检索端点;按标签推荐;"装到已有工作空间"(增量 extends);跨组织能力共享。
