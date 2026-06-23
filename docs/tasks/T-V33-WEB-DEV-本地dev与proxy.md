# T-V33-WEB-DEV — 前端本地 dev 脚本 + vite proxy(让真实前端连真实后端)

蓝本:`docs/里程碑-本地可运行真实工具.md`。**packages/web 域,纯前端 dev 工具链,零业务逻辑/契约。** 前置:main。可与插件批并行。

## 定位
现状:`packages/web` 只有 build/typecheck/test,**无 `dev` 脚本**;`vite.config.ts` **无 proxy**;`ViewClient`/`CommandClient` 用 `baseUrl=""` 发相对路径(`/workspaces/...`、`/views/...`)。本地起前端时这些请求会打到 vite(5173)而非后端(8080)。本卡补 dev 脚本 + proxy,让 `pnpm --filter @m-next/web dev` 起的前端把 API 转发到本地后端。**不改任何业务代码、不改 client 源(仍走相对路径,由 proxy 兜)。**

## 范围
- `packages/web/package.json` 加脚本:`"dev": "vite"`(开发服务器,默认 5173)。
- `packages/web/vite.config.ts` 加 `server.proxy`,把后端 API 前缀转发到 `http://localhost:8080`:
  - `/workspaces`、`/views`、`/meta-commands`、`/rule-commands`、`/commands`(以及 `/v3/api-docs`、`/swagger` 如需)→ `target http://localhost:8080, changeOrigin:true`。
  - 目标地址用 `process.env.MNEXT_API ?? "http://localhost:8080"`,便于改端口。
- 保持现有 alias(`@m-next/views`)与 react 插件不动。

## 封闭文件清单
**修改**:`packages/web/package.json`(加 dev 脚本)、`packages/web/vite.config.ts`(加 server.proxy)。
**零碰**:client 源、业务组件、后端、契约、迁移、其它包。

## 红线 / 门禁
- 纯 dev 工具链;**不改 client baseUrl 逻辑、不改业务**;不新增运行时依赖(vite 已在)。
- `corepack pnpm verify` 全绿(dev 脚本不影响 build/test);proxy 仅 dev server 生效,生产 build 不含。
- 分支 `feat/T-V33-web-dev` 提交不合并;`git merge main` 拉平;完成发 `git diff --stat main`。

## 验收
1. `corepack pnpm --filter @m-next/web dev` 起得来(5173)。
2. 后端在 8080 时,前端请求 `/views/templates`、`/workspaces/{id}/views/...` 经 proxy 命中后端(浏览器 Network 看到 200,非 vite 404)。
3. `corepack pnpm verify` 不回归;生产 `vite build` 产物不含 proxy。

## 跟进
DEV-SEED 提供可点的数据;后续可加 `.env` 切换后端地址。
