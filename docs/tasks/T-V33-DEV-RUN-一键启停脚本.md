# T-V33-DEV-RUN — 一键启停整个 dev 环境(终结环境反复掉)

**仓库脚本 + 文档,不动应用代码、零后端/契约。** 前置:main。
痛点:手动开三个窗口(docker / 后端 jar / 前端),后端窗口一关或被占 8080 就全挂、反复掉。本卡做**一条命令起全部、一条命令停全部**,后端后台运行写日志文件,不再靠人盯窗口。

## 范围
- **A. 启动脚本 `scripts/dev-up.mjs`**(Node,跨平台优先 Windows 可用):
  1. `docker compose up -d`;**轮询等 postgres 健康**(`docker inspect` 健康状态或 `pg_isready`,超时报错)。
  2. 若 `packages/server/target/server-*.jar` 不存在,提示先 `node scripts/run-maven.mjs -DskipTests package`(或自动跑,二选一,默认提示)。
  3. **先清理占用 8080 的旧 java**(Windows:`netstat -ano | findstr :8080` → `taskkill /F /PID`;封装在脚本里,找不到就跳过)。
  4. 后台启动后端:`SPRING_PROFILES_ACTIVE=dev java -jar ...`,**stdout/stderr 重定向到 `logs/server.log`**,记录 PID 到 `.dev/server.pid`。
  5. **轮询等 8080 就绪**(GET `/workspaces/.../views/...` 或 actuator/根路径返回非连接错误;并在日志里确认出现 `DEV SEED ... ready`)。
  6. 前台启动前端:`corepack pnpm --filter @m-next/web dev`(占用当前终端,打印 5173 地址)。
- **B. 停止脚本 `scripts/dev-down.mjs`**:杀 `.dev/server.pid` 的后端进程(及残留 java 占 8080 者)、`docker compose stop`。
- **C. package.json 脚本**:加 `"dev:up": "node scripts/dev-up.mjs"`、`"dev:down": "node scripts/dev-down.mjs"`。
- **D. 文档**:更新 `docs/操作-本地一键跑起来.md`——首选 `corepack pnpm dev:up` 一条起、`corepack pnpm dev:down` 一条停;三窗口手动法保留作兜底。
- **E. .gitignore**:忽略 `logs/`、`.dev/`。

## 封闭文件清单
**新增/修改**:`scripts/dev-up.mjs`、`scripts/dev-down.mjs`、`package.json`(仅 scripts 段)、`docs/操作-本地一键跑起来.md`、`.gitignore`。
**零碰**:应用源码(java/ts/tsx)、契约、迁移、CI 校验逻辑。

## 红线 / 门禁
- 只加开发便利脚本;**不动应用代码与任何校验/契约**。
- 脚本健壮:postgres 未健康/jar 缺失/8080 被占 都给**清晰提示**,不静默失败。
- 不破坏现有 `corepack pnpm verify` / `build`;`verify` 仍全绿。
- 不新增运行时依赖(脚本用 Node 内置 + 已有 docker/CLI)。
- 分支 `feat/T-V33-dev-run` 从 main 起、提交不合并;完成发 `git diff --stat main`。命中红线停下回报。

## 验收
1. 一条 `corepack pnpm dev:up`:自动起 docker→等 postgres→清 8080→后台起后端(日志进 logs/server.log,出现 DEV SEED ready)→起前端 5173。
2. 一条 `corepack pnpm dev:down`:干净停掉后端 + docker。
3. 后端不再需要单独窗口盯着;verify 全绿。
