# T-V36-XMI-2 — XMI 文档集锚定 + 身份保真(完整双向·第二步,B1 心脏)

> ⚠️ **本卡跨"契约 + 迁移人工发起"红线**:新增 Flyway 迁移(**锁 V30**)+ 身份/基线存储。**需用户明确决定派发。** main 当前到 V29,V30 为下一空号。
> **packages/server 域为主,后端;一处加性迁移 V30。** 前置:main(XMI-1 已合,引擎可映射 §3 子集 + 保留 `xmi:id`);设计稿《设计-完整双向XMI交换》§4/§5。

## 目标
为 B1 无损往返立地基:**持久化 `(project/resource, xmi:id) → 平台对象/关系 id` 的身份对应**,并**保留导入项目集的基线 XMI 文档**(每份文档、可随重导入刷新)。本卡只做"存身份 + 留基线",**delta 合并出向留 XMI-4、跨文档引用解析留 XMI-3,本卡不做**。

## 现状(已核实)
- XMI-1:`SysmlXmiModel`/`Mapper`/`Codec` + `SysmlManifestMapping` 可映射 §3 子集;模型已携带 `xmi:id`。
- `import-task`(V18)已存原始 payload(单次导入登记)。**但无"当前基线"概念、无 xmi:id↔平台 id 持久对应。**
- 读模型 `rm_object_source`(V20)记录对象来源(只读投影,不适合塞身份/基线——见设计稿 §4 注)。

## 范围(后端,一处加性迁移 V30)
- **A. 身份表(V30,仅新增)**:新表(如 `xmi_identity`)持久化 `workspace_id, project_ref, xmi_id, platform_kind(object|relation), platform_id, created_at`;唯一约束 `(workspace_id, project_ref, xmi_id)`(**xmi:id 仅文档内唯一,必须带 project_ref 维度**)。**仅新增表,既有零破坏。**
- **B. 基线文档集存储(V30 同批,仅新增)**:新表(如 `xmi_baseline_document`)持久化 `workspace_id, project_ref, content(原始 XMI), content_hash, version, updated_at`;唯一 `(workspace_id, project_ref)`;**重导入刷新该 project_ref 的基线**(更新 content/version)。
- **C. 导入时落身份 + 留基线**:在既有 sysml-xmi 导入路径上**追加**:导入成功后,记录每个元素的 `(project_ref, xmi_id) → platform_id` 到身份表;把该次导入的原始文档存/刷新到基线表。**project_ref 本卡可取单一值**(单项目场景,如文件名/资源 id);**多项目集合的 project_ref 解析与跨文档引用留 XMI-3。**
- **D. 仓储 + 只读查询**:`XmiIdentityRepository` / `XmiBaselineRepository`(写入经既有命令/导入流程,读为只读);供 XMI-4 出向 delta 合并取用。
- **E. 不改**:`import-task` 既有语义(只追加身份/基线记录,不改其登记/解析流程)、读模型投影、其它适配器、其它领域、引擎映射(XMI-1 已定)、前端。**跨文档引用、自定义 profile 透传、delta 出向都不在本卡。**

## 封闭文件清单
**修改/新增**:`packages/server/.../db/migration/V30__xmi_identity_baseline.sql`(身份表 + 基线表,**仅新增**)、`XmiIdentityRepository`/`XmiBaselineRepository`、sysml-xmi 导入落地处(追加身份/基线写入)、相关只读 E2E(导入后身份/基线可查、重导入刷新基线)。
**零碰**:`import-task` 登记/解析语义、读模型投影、其它适配器(ReqIf/Json/Excel)、其它领域、引擎 `Sysml*`(XMI-1 已定)、前端、其它端点契约。

## 红线 / 门禁(契约+迁移卡,加严)
- **迁移仅 V30、仅新增表**(nullable/有默认,既有数据零破坏、回滚安全);不改/不删既有表列。
- 身份/基线为**追加写**,不改既有导入登记/解析语义;不触发重算、不碰读模型语义。
- `(workspace, project_ref, xmi_id)` 唯一;`(workspace, project_ref)` 基线唯一;重导入刷新而非重复插入。
- Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`,含迁移在干净库+既有库 + 导入/重导入 E2E)。
- 分支 `feat/T-V36-xmi2-identity-baseline` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡文件;发 `git diff --stat main`(**须含 V30 迁移**)+ 测试汇总。命中红线(改既有表/动 import-task 语义/碰读模型/其它领域)停下回报,不夹带。

## 验收
1. 导入一份 SysML 1.6 `.xmi` 后,`(project_ref, xmi_id) → platform_id` 身份记录可查;该 project_ref 基线文档已留存。
2. 同一 project_ref 重导入,基线刷新(version 进、content 更新),身份对应随之更新;不重复插入、不报错。
3. 迁移在干净库 + 既有库均成功,既有数据无损;import-task 既有行为零回归;其它领域/适配器零回归;verify 全绿 Skipped:0。

## 跟进(本卡不做)
XMI-3 项目引用图 + 跨文档解析 + 自定义 profile v1 透传;XMI-4 Delta 合并出向(读身份/基线打回);XMI-5 多项目无损往返 E2E;XMI-6 重导入/基线刷新(项目集级、串行归属)。
