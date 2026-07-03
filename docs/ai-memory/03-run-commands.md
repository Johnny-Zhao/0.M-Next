# 本机运行与验证命令（Windows）

## 启动 / 停止

```bat
:: 首次或改过 Java 代码后先打包
node scripts/run-maven.mjs -DskipTests package

corepack pnpm dev:up      :: compose → 等 PG → 后台起后端 → 前台起前端
corepack pnpm dev:down    :: 停后端 + compose stop
```

浏览器开 http://localhost:5173（不是 8080）。后端日志 logs/server.log，
就绪标志：`Started MNextApplication` + `DEV SEED: ... ready`。

## seed 变更后的验收前置（必做）

DevSeedRunner 对已有数据跳过重种，改了 seed/manifest 必须重置数据卷：

```bat
corepack pnpm dev:down
docker compose down
docker volume rm m-next_postgres-data
node scripts/run-maven.mjs -DskipTests package
corepack pnpm dev:up
```

## 验证

```bat
:: 前端小卡开发期快检（秒级~分钟级）
corepack pnpm --filter @m-next/web test
corepack pnpm --filter @m-next/views test
corepack pnpm --filter @m-next/web typecheck

:: 合并前全量门禁（约 10 分钟；必须先 dev:down，否则 jar 被占用 repackage 失败）
corepack pnpm dev:down
corepack pnpm verify
node scripts/check-no-skipped.mjs
```

## 已踩过的坑

1. Java 必须 21（Java 8 跑 jar 报 UnsupportedClassVersionError）
2. node_modules 不可跨机拷贝（pnpm 链接全断）：删 node_modules 后 `corepack pnpm install --frozen-lockfile`
3. 本机 Windows PostgreSQL 服务会抢 5432 → services.msc 停掉设手动
4. postgres 数据卷密码只在首次初始化生效
5. verify 与 dev 后端不能同时跑（jar 文件锁）
