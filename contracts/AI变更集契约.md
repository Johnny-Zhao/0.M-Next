# AI 变更集契约 v1.0

Spec-Ref: T-V33-AI-1a, AG-106, AG-311, AG-406

## 1. 命令端点

端点: `POST /workspaces/{workspaceId}/ai-commands`

命令信封字段:

- `commandType`: `ProposeAiChange` 或 `RejectAiChange`
- `workspaceId`: 必须与路径一致
- `correlationId`: 调用链 UUID
- `idempotencyKey`: 工作空间内幂等键, 1..128 字符
- `payload`: 命令载荷

## 2. ProposeAiChange

载荷:

- `action`: `SUGGEST_FIELDS` 或 `EXPLAIN_CHECK`
- `selection.objectIds`: 选中对象列表, 上限 50
- `selection.checkResultIds`: 选中检查结果列表
- `instruction`: 可选自然语言指令

行为:

- server 装配五类 `AiContext`, 生成稳定 `contextHash`
- `StubAiActionProvider` 确定式执行, 不访问网络
- `SUGGEST_FIELDS` 只生成 `UpdateFields` 变更项, 不写主数据
- 每个变更项做规则 dry-run 预检, 写入 `precheck`
- `EXPLAIN_CHECK` 只写 `resultText`, 不生成变更项

## 3. RejectAiChange

载荷:

- `setId`: 待拒绝的 AI 变更集 UUID

仅 `PROPOSED` 状态可拒绝。拒绝后变更集与项状态均为 `REJECTED`。

## 4. 只读查询

端点: `GET /workspaces/{workspaceId}/views/ai-changes?status=&setId=`

返回变更集列表, 每个变更集包含:

- `setId`, `action`, `status`
- `provider`, `providerVersion`
- `contextHash`, `resultText`
- `createdAt`
- `items[]`: `itemId`, `seq`, `opType`, `payload`, `precheck`, `itemStatus`

## 5. 预检枚举

`precheck.verdict`:

- `WRITABLE`: 未命中阻断或警告规则
- `WARN`: 命中 WARN/INFO 规则
- `BLOCKED`: 命中 BLOCK 规则或预检求值失败

`precheck.details[]` 至少包含 `ruleCode`, `severity`, `message`, `fieldCode`。

## 6. 事件摘要

本阶段事件只作为 AI 契约语义, 不进入内核命令事件集:

- `AiChangeProposed`: 变更集已提出
- `AiChangeRejected`: 变更集已拒绝

## 7. 错误码

- `AI-400-SCHEMA-INVALID`
- `AI-404-CHANGESET-NOT-FOUND`
- `AI-409-IDEMPOTENCY-CONFLICT`
- `AI-422-PROVIDER-FAILED`
- `AI-409-INVALID-STATE`
