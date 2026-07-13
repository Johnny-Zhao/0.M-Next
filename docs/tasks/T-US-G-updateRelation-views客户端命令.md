# 任务卡 T-US-G-updateRelation — views 客户端:UpdateRelation 命令方法(后端已就绪)

- 状态:**可下发**(后端 + 契约 + schema 全就绪,仅补 views client 方法;独立可合)
- 性质:**views 客户端特批小卡**——只加一个命令方法 + 测试,零后端/契约改动;为「unisource `updateRelationField` 接内核」解阻
- PR 要求:`Spec-Ref: contracts/数据内核命令与事件契约.md(§3.5 UpdateRelation)、contracts/schemas/kernel-commands.schema.json($defs/UpdateRelation)、packages/server/src/main/java/com/mnext/server/CommandController.java(updateRelation 已实现,唯一权威载荷)、packages/views/src/api/command-client.ts(post 范式)` + 自检输出段
- 序列位置:解 T-US-016 审查记录的 **updateRelationField 缺口**(当时因无 client 方法而留本地);合入后由后续 unisource 卡消费

## 背景与关键决策(必读)

内核**已完整实现** UpdateRelation:`CommandController.java` 有 `case "UpdateRelation"`,契约 §3.5 + schema `$defs/UpdateRelation` 齐全。载荷 `{relationId, fields, expectedVersion}`(可选 `sourceId`/`targetId` 端点变更,按「Unlink+CreateRelation」语义整体校验);事件 `RelationUpdated`;错误码 `KERNEL-409-VERSION-CONFLICT`、`KERNEL-409-DUPLICATE-RELATION`、`KERNEL-422-CARDINALITY-VIOLATION`、`KERNEL-409-CYCLE-DETECTED`。

**唯一缺口:`command-client.ts` 只有 `createRelation`/`unlink`,没有 `updateRelation`**(016 因此把 `updateRelationField` 留本地)。本卡照 `post()` 范式补方法,**不动 server/contract/schema**。

**决策:** `updateRelation(workspaceId, request)` → `this.post("UpdateRelation", workspaceId, payload)`,复用现信封 + `ck-<uuid>` + `X-Actor-Id` + `CommandFailure`。返回 `RelationCommandResult | void`(同 `createRelation`)。端点变更参数 `sourceId`/`targetId` **仅在提供时进 payload**(默认只改 fields)。

## 涉及文件(封闭清单)

- `packages/views/src/api/command-client.ts` —— 新增 `UpdateRelationRequest`(`relationId` string、`expectedVersion` number、`fields: Readonly<Record<string, unknown>>`、可选 `sourceId`/`targetId`)+ `updateRelation(workspaceId, request): Promise<RelationCommandResult | void>`(mirror `createRelation`)。
- `packages/views/src/api/clients.test.ts` —— 断言:`POST /workspaces/{ws}/commands`、`commandType:"UpdateRelation"`、payload(`relationId`/`expectedVersion`/`fields`,带/不带端点两分支)、`X-Actor-Id`;缺 actor 抛错。

## 行为要求(逐条可测)

1. `updateRelation(ws, {relationId, expectedVersion, fields})` 发 `POST /commands`,`commandType:"UpdateRelation"`,payload 逐位;不含 `sourceId`/`targetId` 字段。
2. 带 `{…, sourceId, targetId}` → payload 携带端点两字段。
3. 未 `setActorId` → 抛"缺少 X-Actor-Id"。
4. 4xx → `CommandFailure`(VERSION-CONFLICT/DUPLICATE-RELATION/CARDINALITY-VIOLATION/CYCLE-DETECTED 可辨);既有方法零回归。

## 测试要求

`clients.test` 加两分支断言(仅 fields / 带端点)+ 无 actor 抛错;既有 client 测试零回归。

## 验收标准

1. `corepack pnpm verify:web` 全绿。
2. `git diff --stat main` 仅 `command-client.ts` + `clients.test.ts`;**server/contract/schema 零改动**。
3. 每步一 commit。

## 禁止事项

禁改 `packages/server`/`contracts`/`schemas`(已就绪);禁改命令信封/幂等键/既有方法/既有错误码;禁发明新错误码;禁触 unisource(消费在后续卡)与 workbench;禁新增 npm 依赖。完成后停止,等待审查。
