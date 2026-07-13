# 任务卡 T-US-G-changeState — views 客户端:ChangeState 命令方法(后端已就绪)

- 状态:**可下发**(后端 + 契约 + schema 全就绪,仅补 views client 方法;独立可合)
- 性质:**views 客户端特批小卡**——只加一个命令方法 + 测试,零后端/契约改动;为后续「unisource 接审批状态机」解阻
- PR 要求:`Spec-Ref: contracts/数据内核命令与事件契约.md(§3.3 ChangeState、§4.6 状态机)、contracts/schemas/kernel-commands.schema.json($defs/ChangeState)、packages/server/src/main/java/com/mnext/server/CommandController.java(changeState 已实现,唯一权威载荷)、packages/views/src/api/command-client.ts(post 范式)` + 自检输出段
- 序列位置:解 T-US-017c 审查记录的 **ChangeState 缺口**;合入后由后续 unisource 卡(审批 PENDING_CONFIRM→CONFIRMED→FILED)消费

## 背景与关键决策(必读)

内核**已完整实现** ChangeState:`CommandController.java` 有 `case "ChangeState"`,契约 §3.3 + schema `$defs/ChangeState` 齐全。载荷 `{targetType: "object"|"relation"|"fieldValue", targetId, fromState, toState, reason, expectedVersion}`;状态机(§4.6)`DRAFT→PENDING_CONFIRM→CONFIRMED→ISSUE→TO_FIX→FIXED→FILED`,任意受控态→`VOID`;`fromState` 必等于当前态(双保险,与 `expectedVersion` 乐观锁并用);错误码 `KERNEL-409-STATE-TRANSITION-INVALID`、`KERNEL-409-VERSION-CONFLICT`、进 CONFIRMED 规则前置未过 `RULE-422`。

**唯一缺口:`packages/views/src/api/command-client.ts` 没有 `changeState` 方法**(017c 的审批状态机因此在 unisource 侧接不了,只能降级前端闸)。本卡照现有 `post()` 范式补一个方法,**不动 server/contract/schema**(全已就绪)。

**决策:** `changeState(workspaceId, request)` → `this.post("ChangeState", workspaceId, payload)`,复用现 `post` 的命令信封 + `ck-<uuid>` 幂等键 + `X-Actor-Id` + `CommandFailure` 封装。返回 `CommandAck | void`(同 updateFields/archive)。**禁止发明新信封/幂等/错误码**。

## 涉及文件(封闭清单)

- `packages/views/src/api/command-client.ts` —— 新增 `ChangeStateRequest`(`targetType` 联合、`targetId`/`fromState`/`toState`/`reason` string、`expectedVersion` number)+ `changeState(workspaceId, request): Promise<CommandAck | void>`(mirror `updateFields`/`archive`);`errorTitles` 补 `KERNEL-409-STATE-TRANSITION-INVALID` 中文标题(可选,便于 Toast)。
- `packages/views/src/api/clients.test.ts` —— 断言:发 `POST /workspaces/{ws}/commands`、body `commandType:"ChangeState"` + payload 六字段逐位、`X-Actor-Id` 头;缺 actor 抛"缺少 X-Actor-Id"分支。

## 行为要求(逐条可测)

1. `changeState(ws, {targetType, targetId, fromState, toState, reason, expectedVersion})` 发 `POST /workspaces/{ws}/commands`,`commandType:"ChangeState"`,payload 六字段逐位一致。
2. 未 `setActorId` → 抛"缺少 X-Actor-Id"(沿用现有守卫,与其他写命令一致)。
3. 4xx → `CommandFailure`(code/title/details 透传);`STATE-TRANSITION-INVALID`/`VERSION-CONFLICT` 可辨。
4. 既有命令方法**零改动、零回归**。

## 测试要求

`clients.test` 加两断言(正常载荷 + 无 actor 抛错);既有 client 测试零回归。

## 验收标准

1. `corepack pnpm verify:web` 全绿(views 改动牵动)。
2. `git diff --stat main` 仅 `command-client.ts` + `clients.test.ts`;**server/contract/schema 零改动**。
3. 每步一 commit。

## 禁止事项

禁改 `packages/server`/`contracts`/`schemas`(已就绪);禁改命令信封/幂等键/既有方法/既有错误码语义;禁发明新错误码(用契约既有);禁触 unisource(消费在后续卡)与 workbench;禁新增 npm 依赖。完成后停止,等待审查。
