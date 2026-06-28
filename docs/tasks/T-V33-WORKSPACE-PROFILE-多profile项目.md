# T-V33-WORKSPACE-PROFILE — 多 Profile 项目(阶段二·2a)

> ⚠️ 含**一处 Flyway 迁移(新增表,加性)** + 写入语义扩展,人工发起。蓝本:`docs/设计-Profile与Stereotype类型隔离与跨域映射.md` 阶段二 2a。
> **前置:PROFILE-SCOPED-TYPES 已合入**(同空间多 profile 不撞码的前提)。

## 目标
让一个工作空间可应用**多个 profile(模块)**,并支持向已有工作空间**追加** profile(即需即装)。这是跨域映射(2b)与实例复用的落脚处。

## 现状(已核实)
- `InstantiateWorkspace` 只从**单个**模板实例化进新工作空间;无"项目挂多模块"结构。
- 元模型已按 tv 隔离(PROFILE-SCOPED-TYPES),同空间多 profile 类型不再撞码。

## 范围
- **A. 迁移(加性)**:新增 `workspace_profile`(workspace_id, template_version_id, applied_by, applied_at,主键/唯一 (workspace_id, template_version_id))。记录工作空间应用了哪些 profile。
- **B. 追加 profile 命令**:新增/扩 meta 命令 `ApplyProfile`(workspaceId, templateId, version)——把该 profile 元模型并入该空间命名空间(经既有 define/copy 路径,按 tv 隔离),并写 `workspace_profile`。幂等(已应用则跳过)。
- **C. 实例化兼容**:`InstantiateWorkspace` 现有"建空间+应用首个模板"路径保持;内部复用/落 `workspace_profile`(首个 profile 也登记)。单 profile 行为零变化。
- **D. 视图/读模型**:读模型对象已带 object_type→tv;`/views/workspaces` 或工作空间详情可暴露"已应用 profile 列表"(只读,供前端按 profile 分组/过滤)。
- **E. 不改**:类型身份语义(阶段一已定)、读模型投影语义、其它领域、单 profile 既有流程。

## 封闭文件清单
**修改/新增**:`packages/server/.../db/migration/Vxx__workspace_profile.sql`、ApplyProfile 命令 + handler(kernel/server 相应层)、`WorkspaceLifecycle`/instantiate 落 workspace_profile、工作空间视图暴露 profile 列表、相关 E2E/单测。
**零碰**:类型身份判定、读模型投影语义、前端(除非只读暴露需要)、其它领域种子。

## 红线 / 门禁
- 迁移**仅新增表**,既有数据零破坏、可回滚;单 profile 工作空间行为零回归。
- ApplyProfile 幂等;并入元模型经既有命令路径,**不改类型身份/写入语义**。
- `corepack pnpm verify` 全绿(含后端 E2E)。
- 分支 `feat/T-V33-workspace-profile` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main` + 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 可向已有工作空间 ApplyProfile 追加第二个 profile;`workspace_profile` 落两行;重复 Apply 幂等不报错。
2. 该空间读模型/视图能区分并展示两个 profile 的对象(按 object_type→tv 分组)。
3. 单 profile 项目(室内/技术方案 Demo)零回归;迁移在干净库+既有库均成功;verify 全绿。

## 跟进(本卡不做)
2b 映射 profile + 跨域对应关系;2c 映射视图;按 profile 的 perspective 切换 UI。
