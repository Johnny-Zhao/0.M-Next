# 验收-同源 P4 批4 backend 走查

范围:017a 校验接内核、017b AI 变更集接内核、017c 审批与 G2 前端投影。

## 前置

1. 启动后端与前端:`corepack pnpm dev:up`。
2. 打开同源页面并指定内核工作空间:`/us?backend=1&ws=<workspaceId>`。
3. 确认页面底部或启动报告显示 backend 模式,再进入 9c/6a/8b。

## 9c 校验权威叠加

1. 打开校验中心,点击「立即运行」。
2. 预期:本地规则仍显示,并叠加内核 checkResults;内核失败时显示可读 toast,不影响本地列表。
3. 分享阻断应同时参考本地阻断与内核阻断。

## 6a AI 变更集旁路

1. 打开 AI 导入页。
2. 预期:原 scripted AI 导入区仍可演示;backend 模式额外出现「内核 AI 变更集(权威)」。
3. 点击同步,预期读取 `/views/ai-changes?status=PROPOSED`。
4. 对某个内核变更集点击确认所列项,预期发送 `ConfirmAiChange` 且 payload 带 itemIds。
5. 点击拒绝,预期发送 `RejectAiChange`;Mock 模式下该权威面板不显示。

## 8b 审批与权限投影

1. 切换为陈默,尝试修改产品规格库字段。
2. 预期:前端闸 `requestWrite` 将写入转为待审批,不直发内核命令。
3. 切换为王芸,在权限页点击「批准并写入」。
4. 预期:016 写桥以当前 session 成员王芸作为 `X-Actor-Id` 落内核;陈默只保留为本地请求归属。
5. 权限页每个成员显示空间角色投影:王芸 ADMIN、李晓 AUTHOR、陈默 AUTHOR、周然 VIEWER。
6. 陈默详情显示「数据只读 + 表达可编」;脱敏与字段级 deny 行为保持原演示口径。

## 已知缺口

ChangeState 与 initialState=PENDING_CONFIRM 暂不接入。原因是当前 views CommandClient 未暴露 ChangeState 方法;在未能转换状态前创建 PENDING_CONFIRM 对象会形成悬挂未决态。后续由 views `changeState` 客户端小卡与 017d 状态机卡补齐。
