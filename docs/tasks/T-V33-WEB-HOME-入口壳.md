# T-V33-WEB-HOME — 入口壳:登录 + 项目列表 + 新建向导

蓝本:`bs-home.html`(Design)+ `平台UI-首页-登录新建项目-ClaudeDesign.md`。**packages/web 域,纯前端,零新依赖**。前置:P1。
**与 P2/SKIN/inspector 文件不相交**——只动 `app.tsx` 顶层路由 + 新增 `home/*`,**不碰** `workbench/*`、`diagram-panel.tsx`、`styles.css`、views 源、后端。可独立排/合。

定位:工作台之前的入口壳。路由:**登录 → 项目列表 → 新建向导 → 进工作台**。登录现阶段只设 `actor-id`(真实认证/SSO 占位待接入);列表/实例化用现有 client 能力,缺则 TODO + 占位,**不发明 view-API/client**。

## 范围
- **A. 入口路由(不引 react-router)**:`app.tsx` 顶层按"是否已选定工作空间"在 `<Home/>` 与 `<Workbench/>` 间切换;选定项目 → 进工作台;工作台内提供"返回项目"。纯状态切换,零依赖。
- **B. 登录(actor-id 占位)**:登录 UI(账号/密码字段 + **SSO/企业入口禁用并标"待接入"**;不开放注册)。提交 = 设置 `actorId` 并进入。**不处理真实凭据**;真实认证/SSO 标 `TODO(待后端)`。
- **C. 项目列表**:列工作空间——**若 client 有列表端点则读,否则本地/占位 + `TODO(view-API): 工作空间列表未提供`**;卡片(名称 · 所属插件 · 我的角色 · 告警计数,有则显示)+ 搜索 + **空态(还没有项目→引导新建)** + 新建按钮。
- **D. 新建向导(分步状态机)**:命名 → **选插件(profile/模板**,列表来自 client 若有,否则占位 + TODO) → 基础配置(默认值 / 邀请成员分配 RBAC 角色 的 UI) → 创建(经现有**模板实例化命令**若 `CommandClient` 暴露,否则 stub + `TODO`) → 进工作台。
- **E.(可选)插件/模板库屏**:启停 / 导入 的 UI 占位(深度配置跳"作者台",不在本卡)。

## 封闭文件清单
**修改**:`packages/web/src/app.tsx`(顶层路由:Home ↔ Workbench)
**新增**:`packages/web/src/home/Home.tsx`、`Login.tsx`、`ProjectList.tsx`、`NewProjectWizard.tsx`、`home.css`、对应 `*.test.tsx`
**零碰**:`packages/web/src/workbench/**`、`diagram-panel.tsx`、`styles.css`、`packages/views/**` 源、后端、契约、迁移。

## 红线 / 门禁
- **纯前端、零新依赖**(状态切换路由,不引 react-router);**不碰 workbench/styles.css**(避开 P2/SKIN)。
- **登录只设 actor-id**,真实认证/SSO **不实现**、标 TODO;不处理真实凭据(符合安全红线)。
- **不发明 view-API/client**:工作空间列表 / 模板实例化 若现有 client 无 → TODO + 占位,不新增契约;有则用。写经 `CommandClient`。
- `corepack pnpm verify` 全绿;不降覆盖率。
- 分支 `feat/T-V33-web-home` 提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + `pnpm --filter @m-next/web test` 汇总。

## 验收
1. verify 全绿;测试:路由切换(登录→项目→工作台→返回)、登录设 `actorId`、向导分步状态机推进、项目列表空态。
2. **不碰 workbench 文件**(`git diff --stat` 确认只有 `app.tsx` + `home/*`);无新依赖 / 后端 / 契约 / 迁移 diff;views 源零改。
3. 缺的后端能力(工作空间列表 / 实例化 / 真实认证)均为 TODO + 占位,不编造。

## 跟进(本卡不做)
真实认证 / SSO / 组织(待后端)、工作空间列表 view-API、模板实例化 client 方法、插件深度配置(进阶作者台)、令牌与工作台统一(随 SKIN 换肤)。
