# 任务卡 T-V33-104 — 阶段1 批4:Outbox 投递器 + OpenAPI 生成（收口）

- 状态:**可下发(依赖准入已批准 2026-06-13:amqp/springdoc 已入 allowlist + ADR-007/001 准入记录)**
- 分支:`feat/T-V33-104-outbox-relay-openapi`(从最新 main 切出,AG-401)
- PR 要求:`Spec-Ref: 契约§7-Outbox投递语义, §10.2-AsyncAPI通道, §10.3-OpenAPI生成约定, ADR-007, AG-201/206-不阻塞, AG-210-幂等消费, AG-506-基础设施封装` + AG-405 自检输出段
- 依据:contracts §7/§10.2/§10.3;ADR-007(PG event_outbox + 轮询发布器 + RabbitMQ);现状 V1 已建 `event_outbox` 表与 PENDING 索引,命令已写入 outbox,**尚无发布器**
- 对应:阶段1 收口(BatchCommand 已于批3 完成,本批补"投递器 + OpenAPI 生成");解锁阶段5 读模型消费

## 人工前置(非 Codex,缺一不可开工)

依赖准入(ADR-008:license/arm64/离线私服 三关 + allowlist 登记,均须人确认):
1. `spring-boot-starter-amqp`(RabbitMQ 客户端,Apache-2.0,纯 JVM)→ `ci/deps-allowlist.yaml` + ADR-007 实现说明。
2. `springdoc-openapi-starter-webmvc`(OpenAPI 3.1 生成,Apache-2.0,纯 JVM)→ allowlist + 在 ADR-002 或新 ADR 登记。
> 二者均符合 ADR-008 准入条件,但 AG-502 要求**先批准后引入**;本前置完成前 Codex 不得加依赖。

## 目标

落地 Outbox 至少一次投递链路与命令 API 的 OpenAPI 3.1 生成,使事件可被下游(阶段5 读模型)消费、契约可被工具消费。**不实现读模型消费者、CloudEvents 网关、AsyncAPI 文档发布(BL-09)。**

## 涉及文件(封闭清单)

- kernel/internal/persistence 或 server 组合根:`OutboxRelay`(轮询发布器)+ `RabbitOutboxPublisher`(**RabbitMQ 客户端仅此一处,AG-506**)+ `TestOutboxRelay`(测试同步 drain,AG-504);事件信封序列化复用既有 `EventJson`。
- server:`application.yml` 增 AMQP 与 springdoc 配置(端点经 env,AG-505);命令端点补 springdoc 注解(最小,不改命令逻辑)。
- 契约测试:`tests/contracts` 增 OpenAPI 断言(所有已注册 commandType 出现在生成文档)。
- **禁止**:改 V1/V2/V3 迁移;改批1–3 命令处理器逻辑;新建主数据表。

## 行为要求(逐条可测)

1. **轮询投递(§7,ADR-007)**:`OutboxRelay` 周期扫描 `event_outbox WHERE status='PENDING' ORDER BY sequence`,逐条发布到 RabbitMQ,通道命名 `workspace.{workspaceId}.events`(§10.2);成功 → `status='PUBLISHED', published_at=now`;失败 → `retry_count++` 保持 PENDING,**指数退避上限**重试;**至少一次**语义(消费侧去重,见 4)。
2. **热路径隔离(AG-201/206)**:投递器在**命令事务之外**运行(独立调度/worker 装配);命令处理器只写 outbox(已实现),**禁止**在命令事务内发起 RabbitMQ 出站。
3. **顺序与并发**:同一 aggregate 的事件按 `sequence` 单调投递;投递器多实例下用 `FOR UPDATE SKIP LOCKED` 或单实例租约防重复发布(择一,PR 说明取舍)。
4. **消费幂等契约(AG-210)**:投递信封含 `eventId`;**本批不建业务消费者**,但须提供 `@IdempotentConsumer` 注册骨架 + 一个 drain 测试消费者断言重复投递只生效一次(去重表/幂等键)。
5. **OpenAPI 3.1(§10.3)**:springdoc 生成 `/v3/api-docs`;命令端点 `POST /workspaces/{id}/commands` 入参/错误响应结构出现在文档;契约测试断言 11 个已注册 commandType 全覆盖。

## 测试要求(jacoco ≥0.80 门禁;**AG-504 禁 sleep**)

必含:`TestOutboxRelay` 同步 drain 后断言 PENDING→PUBLISHED 且 published_at 非空;发布失败注入 → retry_count 递增且保持 PENDING、不丢事件;同 aggregate 多事件按 sequence 投递;**重复投递同 eventId 消费仅一次**(幂等);并发双实例不重复发布(SKIP LOCKED/租约);OpenAPI 文档断言全 commandType 覆盖。等待异步**只用** TestOutboxRelay 同步 drain 或 Awaitility 带超时(AG-504)。

## 验收标准(机器可判)

1. `pnpm verify` 全绿(贴 jacoco 段);2. 集成演示:建对象→事件入 outbox→relay drain→RabbitMQ 收到 `workspace.{id}.events` 消息→outbox 标 PUBLISHED;3. `GET /v3/api-docs` 含全部命令;4. `git diff --stat main` 限封闭清单且批1–3 处理器逻辑零改;5. PR 含 AG-405 自检输出与"多实例防重"取舍说明;6. `pnpm architecture:check` 通过(RabbitMQ 客户端仅在 RabbitOutboxPublisher,AG-506)。

## 禁止事项

禁止实现:阶段5 读模型投影/查询、CloudEvents 网关转换、AsyncAPI 文档发布(BL-09)、任何新命令类型、规则/AI/适配器。禁止触碰:contracts/schemas/**(只增 OpenAPI 断言测试)、AGENTS.md、ADR/**(依赖登记由人前置完成)、迁移文件、packages/{views,web}/**。每步一 commit,完成后停止等待审查。
