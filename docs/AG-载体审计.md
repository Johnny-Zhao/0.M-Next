# AG 载体审计

本审计面向 `AGENTS.md` 当前 43 条 `AG-xxx` 红线，记录每条规则在仓库中的自动化载体。标记 `⚠️` 表示已有部分载体但仍依赖 CI 配置、PR 模板或人工复核补齐。

## 载体索引

| 规则 | 自动载体 | 状态 |
| --- | --- | --- |
| AG-100 | `pnpm architecture:check` 跨包依赖规则；`architecture:test` Java 架构测试 | 自动 |
| AG-101 | `pnpm architecture:check`、前端 ESLint restricted import、`packages/views` 测试 | 自动 |
| AG-102 | `pnpm architecture:check` storage key 扫描；前端 lint | 自动 |
| AG-103 | `pnpm architecture:check` kernel 依赖白名单；`DiffArchitectureTest`/架构测试 | 自动 |
| AG-104 | `pnpm architecture:check` kernel internal 深路径禁用 | 自动 |
| AG-105 | `pnpm architecture:check` rules 写命令禁用 | 自动 |
| AG-106 | `pnpm architecture:check` ai 写命令白名单 | 自动 |
| AG-107 | 主服务依赖清单与架构扫描覆盖 sim 依赖缺失；镜像内容比对仍依赖 CI | ⚠️ 部分 |
| AG-108 | `ExchangeArchitectureTest`、`pnpm architecture:check` exchange 纯依赖扫描 | 自动 |
| AG-109 | `pnpm architecture:check` template/TaskHandler 扫描 | 自动 |
| AG-110 | `pnpm architecture:check` SQL/写路径扫描；`CommandIntegrationTest`、`GoldenPathE2ETest` | 自动 |
| AG-201 | `pnpm architecture:check` 命令热路径依赖扫描；kernel 命令单测 | 自动 |
| AG-202 | view-client 分页测试、矩阵/文档视图测试；事件处理器全量查询扫描仍需增强 | ⚠️ 部分 |
| AG-203 | `ReadModelQueryIntegrationTest`、`MatrixQueryIntegrationTest`、关系查询参数测试 | 自动 |
| AG-204 | AI 变更链路当前未进入 MVP；source=AI 因果契约需随 AI 卡补专测 | ⚠️ 待补 |
| AG-205 | 同 AG-107；仿真部署隔离仍依赖 CI 镜像清单 | ⚠️ 部分 |
| AG-206 | 当前 MVP 未开放深解析上传主链路；上传链路专测待制品卡补齐 | ⚠️ 待补 |
| AG-207 | `pnpm architecture:check` 裸线程/TaskHandler 扫描；TaskHandler 契约测试待任务队列卡补齐 | ⚠️ 部分 |
| AG-208 | `OutputIntegrationTest`、`SnapshotIntegrationTest`、输出控制器契约测试 | 自动 |
| AG-209 | `selection-coordinator.test.ts`、矩阵/文档视图联动测试；写请求拦截仍需 E2E 强化 | ⚠️ 部分 |
| AG-210 | `IdempotentConsumerRegistryTest`、`ReadModelProjectionTest`、outbox 去重集成测试 | 自动 |
| AG-211 | `pnpm architecture:check` 重型依赖扫描；冷路径 TaskHandler 专项仍待补 | ⚠️ 部分 |
| AG-301 | `pnpm contracts:check`、`OpenApiContractTest`、命令/事件枚举单测 | 自动 |
| AG-302 | `spotless:check`、`checkstyle`、ESLint naming/文件名规则 | 自动 |
| AG-311 | `packages/shared/contracts/error-codes.yaml` 扫描、控制器异常测试 | 自动 |
| AG-312 | 控制器契约测试覆盖主要错误响应；全端点建议操作字段仍需扩大覆盖 | ⚠️ 部分 |
| AG-321 | kernel 命令集成测试、迁移 NOT NULL lint、`GoldenPathE2ETest` 间接覆盖 | 自动 |
| AG-322 | `EventJsonTest`、kernel 命令单测、outbox 投递集成测试 | 自动 |
| AG-323 | MDC/日志格式仍主要依赖 CI 配置与人工审查；secret 扫描待接入本地门禁 | ⚠️ 部分 |
| AG-324 | SQL lint 可覆盖禁止 UPDATE/DELETE；`audit_log` 专项权限测试待补 | ⚠️ 部分 |
| AG-401 | 分支名由 CI/PR 门禁校验；本卡分支 `feat/T-V33-S1-quality-baseline` | 自动 |
| AG-402 | PR 模板 `Spec-Ref:` 字段校验；本地无法完全复现 | ⚠️ 部分 |
| AG-403 | commitlint/PR 提交流水线；本地提交信息自检 | ⚠️ 部分 |
| AG-404 | `pnpm verify` 聚合 format、lint、typecheck、test、build；双架构镜像/性能仍在 CI | ⚠️ 部分 |
| AG-405 | 写后 `wc -l`/`tail -3`/解析校验；PR 自检段人工核对 | ⚠️ 部分 |
| AG-501 | `pnpm architecture:check` 路径保护、CODEOWNERS/PR 保护 | 自动 |
| AG-502 | `pnpm architecture:check` 依赖 allowlist、lockfile/POM 扫描 | 自动 |
| AG-503 | `CommandIntegrationTest`、查询端点 workspace 隔离集成测试 | 自动 |
| AG-504 | `pnpm architecture:check` 测试 sleep/setTimeout 扫描 | 自动 |
| AG-505 | 硬编码公网 URL 扫描规则仍需 CI 强化；本地以 architecture/lint 部分覆盖 | ⚠️ 部分 |
| AG-506 | `pnpm architecture:check` 驱动依赖位置扫描、`ReadModelArchitectureTest` | 自动 |
| AG-507 | `ExchangeArchitectureTest`、JSON/ReqIF 交换集成测试、`GoldenPathE2ETest` | 自动 |
| AG-508 | 依赖 allowlist 覆盖 C 级工具禁入；golden files 专项仍待标准适配器扩展 | ⚠️ 部分 |
