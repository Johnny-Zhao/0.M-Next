# Codex 下发提示词 v0.5.1（三卡并行）

## 前置（必须先满足,否则 Codex 必然阻塞)

1. **spec-change 已提交进 `main`**:契约 addendum（contracts/元模型命令契约.md、contracts/评审命令契约.md、contracts/schemas/{meta,review}-commands.schema.json、tests/contracts/fixtures/{meta,review}-commands/**）、error-codes.yaml（KERNEL-/REVIEW- 新码）、AGENTS.md（AG-311 六类 + AG-301 addendum）、ci/deps-allowlist.yaml、ADR-001/007 准入记录、scripts/check-contracts.mjs、.prettierignore 等。**AI 不得代提交契约(AG-501),由人执行。**
2. **并行用独立 git worktree**,严禁三会话共用同一工作树（会互相切换分支干扰):
   ```bash
   git worktree add ../mnext-201 -b feat/T-V33-201-metamodel-authoring main
   git worktree add ../mnext-R01 -b feat/T-V33-R01-review-annotations main
   git worktree add ../mnext-104 -b feat/T-V33-104-outbox-relay-openapi main
   ```
   每个 Codex 会话在各自目录工作;或改为串行,不可并发同树。

---

## 会话 A — T-V33-201 元模型

你是本仓库的工程实现代理(Codex)。严格遵守 AGENTS.md 全部 AG-xxx 约束。
开工前依次只读:AGENTS.md、docs/tasks/T-V33-201-阶段2元模型批1.md、蓝本 docs/04-metamodel-m2-design.md 与 contracts/元模型命令契约.md、迁移 V1/V2。不读无关文件。
在 worktree ../mnext-201(分支 feat/T-V33-201-metamodel-authoring)工作。
只实现这一张卡,限定在卡的"涉及文件(封闭清单)"内最小改动。硬约束:
- 纯增量:新增迁移 V3,绝不改 V1/V2;不改批1–3 处理器逻辑,仅在 CreateObjectHandler/UpdateFieldsHandler 预检处各加一行 fieldValidator.validate(...)。FieldValidator 在 kernel 内部,直接经 kernel 仓储读 data_object 校验 ref 存在性(无需新端口)。
- M2 授权走独立端点 POST /workspaces/{id}/meta-commands,绝不混入 M1 /commands。
- 命令名/错误码只能用契约 addendum 已登记者(AG-301/311);不得改 contracts/**、AGENTS.md、ADR/**。
- 事务内零出站(AG-201);审计字段取认证上下文(AG-321);测试禁 sleep(AG-504);jacoco≥0.80,含 FieldValidator 全类型矩阵。
完成判据:pnpm verify 全绿(贴 jacoco)、contracts:check 与 architecture:check 通过;git diff --stat main 限封闭清单。
每步一 commit;PR 含 Spec-Ref 与 AG-405 写后自检输出。完成后停下等 Claude 审查,不自行合并、不继续其它卡。

---

## 会话 B — T-V33-R01 评审内核

你是本仓库的工程实现代理(Codex)。严格遵守 AGENTS.md 全部 AG-xxx 约束。
开工前依次只读:AGENTS.md、docs/tasks/T-V33-R01-评审内核批1.md、蓝本 docs/06-review-model.md 与 contracts/评审命令契约.md。不读无关文件。
在 worktree ../mnext-R01(分支 feat/T-V33-R01-review-annotations)工作。
只实现这一张卡,限定在卡的"涉及文件(封闭清单)"内最小改动。硬约束:
- 隔离红线(最重要):engines/review 自有存储;严禁 import kernel/internal;严禁写/改 data_object/data_field_value/data_relation。
- 目标存在性校验经**新增的 kernel/api 只读端口 KernelQueryPort**(objectExists/relationExists/fieldDefExistsForObject),其实现 KernelQueryAdapter 落 kernel/internal(只读、带 workspaceId、命中索引)。这是本卡允许的唯一 kernel 改动,不得碰批1–3 写路径。
- 评审命令走 POST /workspaces/{id}/review/commands;查询 GET .../annotations。REVIEW- 错误码以 addendum 为准;批1 不算 stale、不发事件。
- 关键测试:ResolveAnnotation 后断言目标 object/field/relation version 全程不变(隔离性);架构断言 engines/review 无 kernel/internal import。禁 sleep(AG-504);jacoco≥0.80。
完成判据:pnpm verify 全绿(贴 jacoco)、contracts:check 与 architecture:check 通过;git diff --stat main 限封闭清单。
每步一 commit;PR 含 Spec-Ref 与 AG-405 写后自检输出。完成后停下等 Claude 审查,不自行合并、不继续其它卡。

---

## 会话 C — T-V33-104 Outbox 投递器 + OpenAPI

你是本仓库的工程实现代理(Codex)。严格遵守 AGENTS.md 全部 AG-xxx 约束。
开工前依次只读:AGENTS.md、docs/tasks/T-V33-104-阶段1批4-Outbox投递与OpenAPI.md、contracts/数据内核命令与事件契约.md(§7/§10.2/§10.3)、ADR-007。不读无关文件。
在 worktree ../mnext-104(分支 feat/T-V33-104-outbox-relay-openapi)工作。
只实现这一张卡,限定在卡的"涉及文件(封闭清单)"内最小改动。硬约束:
- RabbitMQ 客户端只在 RabbitOutboxPublisher 封装层(AG-506);投递器在命令事务之外,命令事务内绝不发 RabbitMQ 出站(AG-201)。
- 至少一次 + 消费幂等(AG-210, eventId 去重);同 aggregate 按 sequence;多实例 FOR UPDATE SKIP LOCKED 或租约防重(PR 说明取舍)。
- 测试只用 TestOutboxRelay 同步 drain 或 Awaitility 带超时,禁 sleep(AG-504);jacoco≥0.80。
- 依赖仅限已入 allowlist 三项:spring-boot-starter-amqp、springdoc-openapi-starter-webmvc-ui、testcontainers:rabbitmq;不得引入其它依赖(AG-502)。
- OpenAPI 3.1 经 springdoc,/v3/api-docs 覆盖全部 11 个 commandType;不改命令逻辑仅补注解。
- 不实现:阶段5 读模型消费者、CloudEvents 网关、AsyncAPI 文档发布(均后置)。
完成判据:pnpm verify 全绿(贴 jacoco)、architecture:check 通过(RabbitMQ 仅在 RabbitOutboxPublisher);git diff --stat main 限封闭清单且批1–3 处理器零改。
每步一 commit;PR 含 Spec-Ref、AG-405 自检输出、多实例防重取舍说明。完成后停下等 Claude 审查,不自行合并、不继续其它卡。
