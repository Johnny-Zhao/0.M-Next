# T-V33-VIEW-TEMPLATES-A — 模板目录只读端点(选 profile 列真模板)

蓝本:`docs/设计稿-室内设计profile.md` §4(已定走真端点)。**packages/server 视图读侧。人发起的契约面新增(经确认)。** 前置:main。

## 定位
给 HOME 新建向导「选 profile」一步提供**已发布模板目录**:列出每个已发布模板(名称/简介/版本/类型概览),让用户真选到「室内设计」。**纯读、有界,不写、不加迁移**(读现有 `scene_template` / `scene_template_version` / `object_type`)。

## 现状(先验证)—— **F0 已建最小版,本卡改为"扩展"不是"新建"**
- 表已存在:`scene_template(id, code, name, created_by, created_at)`、`scene_template_version(id, template_id, version, status∈{draft,published,withdrawn}, published_at, published_by)`;`object_type.template_version_id` 关联类型到版本。
- **F0 已新建** `packages/server/.../TemplateCatalogController.java`:`GET /views/templates`,查询 `WHERE status='published'` + `DISTINCT ON(template.id) ORDER BY version DESC`(每模板取最高已发布版本),返回 `{templateId, code, name, version}`。**已正确排除 withdrawn/draft、已取最高版本**——本卡**不要重建控制器、不要重复加 withdrawn 排除**。
- **本卡只补 F0 没做的富字段 + TS 客户端**:`description`(无列→null)、`typeOverview`(≤20 截断)、`view-client.ts` 的 `templates()`,并补富字段的测试。

## 范围(在 F0 的 `TemplateCatalogController` 上**扩展**)
- **扩 `TemplateCatalogItem`/查询**,每项在现有 `{templateId, code, name, version}` 基础上加:
  - `publishedAt`(从 `scene_template_version`);
  - `typeOverview`:该版本下对象类型概览 `[{code,name}]`(`object_type WHERE template_version_id=该版本`),**上限 ≤20,超出截断并标记**;
  - 简介 `description`:**若现表无简介列,置 `null`**(不编造;简介列属后续契约,见跟进)。
  - 保持 F0 的语义:**只列至少一个 published 版本、每模板取最高 published 版本、排除 withdrawn/draft**(不改)。
- **TS 客户端**:`view-client.ts` 加 `templates(): Promise<TemplateCatalogItem[]>`(无 workspaceId 参数)。

## 封闭文件清单
**修改**:`TemplateCatalogController.java`(扩 record + 查询,**勿重建**)、`packages/views/src/api/view-client.ts`、(若有)OpenAPI 契约。
**新增**:`packages/server/src/test/java/com/mnext/server/TemplateCatalogQueryIntegrationTest.java`(富字段/截断)、view-client 用例。
**零碰**:写命令/事件、模板生命周期逻辑本体(F0 的 withdraw/restore)、迁移、其它域;**不动 F0 已建的 published-only/最高版本/withdrawn 排除逻辑**。

## 红线 / 门禁
- **只读**:读 `scene_template`/`scene_template_version`/`object_type` 拼装;**不写、不加迁移、不改模板生命周期**(AG-101/102/501)。
- **有界**:typeOverview ≤20 截断标记;只返 published。
- **不编造**:无简介列 → `description:null`,不臆造;无类型 → 空数组。
- 契约面新增经本稿确认;OpenAPI 契约测试同步;不引新依赖。
- `corepack pnpm verify` 全绿;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped);与其它 server e2e 错峰;jacoco 不降。
- AG-405 落盘自检;分支 `feat/T-V33-view-templates-a` 提交不合并;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- **若列模板/取类型概览需改模板生命周期或新增存储才能拿到 → 停下回报,不夹带。**

## 验收(集成测试,纯 API)
1. 建 2 模板:A 有 published 版本(含若干 object_type),B 仅 draft。`GET /views/templates` → **只含 A**,带 `code/name/latestPublishedVersion/publishedAt` 与 `typeOverview`(类型 code/name 正确)。
2. 同模板多版本(v1、v2 均 published)→ 取 v2(最高)。
3. 有界:>20 类型 → 截断并标记。
4. 无简介列 → `description:null`;无类型 → `typeOverview:[]`。
5. 回归:`/views/*` 其它端点与行为不变;views 仍只读;无迁移 diff。
6. view-client:`templates()` URL(无 workspace)/解析用例。

## 跟进(本卡不做)
- 模板**简介/封面/标签**列(需迁移 + 契约,人发起);向导按 `typeOverview` 渲染预览;按角色/可见性过滤模板。
