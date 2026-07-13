# 任务卡 T-US-017c — P4 批4c:审批与 G2 权限投影(降级口径:ChangeState 缺口延后)

- 状态:**可下发**(依赖 015+016+017a+017b 已合并;**A 降级口径**,用户已拍板)
- 性质:P4 批4 拆分之 **c**(审批)——P4 批4 收官。**只动 unisource(access/ + docs)**;**不新增内核调用**(审批写已由 016 承载);ChangeState 状态机记为缺口延后
- PR 要求:`Spec-Ref: docs/预研-E3-同源Mock到内核契约对接.md(§三 session→X-Actor-Id、§四 G2)、docs/tasks/T-US-016-P4批3-写路径.md(审查结论:写桥以当前 session 成员作内核 actor)、docs/RBAC权限-设计稿.md、packages/web/src/unisource/state/session-store.ts(requestWrite 前端闸)、packages/views/src/api/command-client.ts(无 ChangeState 方法——缺口佐证)` + 自检输出段
- 序列位置:批4c(收官);后续「ChangeState views 小卡 + 017d 状态机」为独立跟进(见决策 2)

## 背景与关键决策(必读)

**审批现状 + 016 已承载(务必先读代码):**
- 前端闸:陈默(数据只读 + 表达可编)的数据写经 `session-store.requestWrite`(`grid-actions`/`matrix-actions` 调用)——`can(actor,res,"editData")` 为假 → **转本地变更集**(不直发内核),在 `access/approval-card.tsx` 列为待审批。
- 批准:王芸点「批准并写入」→ `changeSetStore.approveChangeSet(id, approver)` → `confirmAll` → `applyItem` → `workspaceStore.updateField/createObject`。
- **016 已成立的关键事实:写桥(`write-bridge`)在派发内核命令前取 `sessionStore.currentMemberId` 作 actor**。批准发生在王芸(ADMIN)会话下,故 **`applyItem` 的内核写天然以「审批人」身份落内核**,请求人(陈默)仅作本地事件归属——正是审批应有的语义。**这部分本卡不重做,回归验证 + 断言即可。**
- 前端闸的兜底:即便某写绕过 requestWrite 直达 016,内核 `PERM-403-FIELD-DENIED` 会被 016 回滚 + Toast(016 已实现)。

**决策 1 —— A 降级口径(用户已拍板)。**
`@m-next/views` 的 `CommandClient` **没有 `ChangeState` 方法**(后端 `CommandController`/契约 `数据内核命令与事件契约.md` 有 DRAFT→PENDING_CONFIRM→CONFIRMED→ISSUE→TO_FIX→FIXED→FILED,但客户端未暴露;views 禁改红线)。故内核审批**状态机**在 unisource-only 下**接不了**(同 016 的 updateRelationField 缺 client 方法)。本卡**降级**:审批仍是**前端闸 + 016 落数据**;**ChangeState 状态机记为缺口**,待将来一张 **views `changeState` 客户端小卡(仿 G1 推后端/契约那样单开)**合入后,由跟进卡(017d)接完整生命周期。

**决策 2 —— PENDING_CONFIRM initialState 与 ChangeState 一并延后(对用户 A 选项内该子项的收窄,请审查确认)。**
`createObject` 客户端虽有 `initialState: PENDING_CONFIRM`,但**前端闸下,陈默的 create 被本地 hold 到批准后才写**,而批准即已授权 → 应写 **active**;若本卡就发 `PENDING_CONFIRM`,内核对象会**卡在未决态且无 ChangeState 可转换**(反成脏态)。故 `initialState=PENDING_CONFIRM` 与 ChangeState **捆绑延后**到 017d。**⚠️ 若你坚持本卡即发 PENDING_CONFIRM(接受卡态),审查时说,我在封闭清单加 `initialState` 线(需重开 016 的 store.createObject / write-bridge / gateway.createObject 面)。** 默认不加。

**决策 3 —— G2 前端角色投影(演示级,标注安全边界)。**
新增纯函数 `projectSpaceRole(memberId, permissions) → "ADMIN"|"AUTHOR"|"REVIEWER"|"VIEWER"`,从 `PermissionMatrix` 派生(取各资源最高权级:含 `admin`→ADMIN;含 `edit`/`owner`→AUTHOR;仅 `readonly`/`none`→VIEWER)。四人落 **王芸 ADMIN / 李晓 AUTHOR / 陈默 AUTHOR / 周然 VIEWER**(REVIEWER 演示未用,保留枚举)。access 页(8b)每成员上屏空间角色徽标;陈默标注 **AUTHOR + 数据类型字段级 deny(数据只读 + 表达可编;脱敏「···」为该投影,已存在)**。**这是前端投影,不下发内核**(内核按 actor id 的空间角色自行鉴权;真实资源级 RBAC 属后端长期,文档标安全边界)。

**决策 4 —— 审批人 actor 固化。** 加断言/走查:backend 模式批准时,内核写以**当前会话成员(审批人)**为 `X-Actor-Id`(经 016),请求人仅本地归属;陈默数据写经前端闸不直发内核(回归)。

**范围裁剪(写清理由):**
- **不实装 ChangeState / PENDING_CONFIRM 状态机**(决策 1/2,缺 client 方法,延后 017d)。
- **不新增任何内核命令调用**(审批写已由 016 承载;G2 是前端投影;RBAC Grant/Revoke 属工作空间搭建,client 亦无此方法)。
- **不改 016 写面与 `changeSetStore` 本地审批 API**(`approveChangeSet`/`rejectChangeSet`/`requestWrite` 行为不变)。
- **不做真实资源级 RBAC/脱敏后端化**(G2 长期,demo 投影 + 安全边界注)。

## 目标

G2 四人→空间角色前端投影上屏(access 8b);固化并走查「批准即以审批人身份落内核」(经 016);记 ChangeState/PENDING_CONFIRM 缺口与 017d 跟进;产出 P4 批4(校验+AI+审批)backend 端到端走查;**演示与 Mock 逐位零改**。

## 涉及文件(封闭清单)

**新增**
- `packages/web/src/unisource/access/space-role.ts` —— `SpaceRole` 类型 + `projectSpaceRole(memberId, permissions)` + `SPACE_ROLE_LABEL`(纯函数,无 IO)。
- `packages/web/src/unisource/access/space-role.test.ts` —— 四人投影 = ADMIN/AUTHOR/AUTHOR/VIEWER;边界(全 none→VIEWER;含 admin→ADMIN)。

**改**
- `packages/web/src/unisource/access/access-view.tsx` —— 每成员显示空间角色徽标(`projectSpaceRole`);脚注补 G2 投影与安全边界一句。
- `packages/web/src/unisource/access/member-detail.tsx` —— 成员详情显示空间角色 + 数据/表达权限拆分(复用现有权限数据,不改数据源)。

**新增文档**
- `docs/验收-同源P4批4-backend走查.md` —— 校验(017a)+ AI 变更集(017b)+ 审批(017c)在 `?backend=1&ws=` 下的端到端走查步骤与预期(含「陈默越权→王芸批准→内核以王芸身份落值」「9c 内核权威叠加」「6a 内核 aiChanges 旁路 + 逐项确认」)。

**可选(需则纳入,append-only、token 取色)**
- `packages/web/src/unisource/us-components.css` —— 空间角色徽标样式(优先复用既有 tag/badge 类)。

**守护(不改、须绿)**
- `data/import-boundary.test.ts`;**不触 `data/**` 与 016 写面**;`gateway`/`command-client` 不改。

## 行为要求(逐条可测)

1. **投影正确:** `projectSpaceRole` 对 seed 权限投影 = 王芸 ADMIN / 李晓 AUTHOR / 陈默 AUTHOR / 周然 VIEWER;含 `admin`→ADMIN、仅 `readonly`/`none`→VIEWER。
2. **8b 上屏:** access 页每成员显示空间角色徽标;陈默标注「数据只读 + 表达可编」。
3. **审批人 actor(经 016,走查 + 断言):** backend 模式批准时内核写以当前会话成员(审批人)为 actor;请求人仅本地事件归属。
4. **前端闸回归:** 陈默数据写经 `requestWrite` 转审批、不直发内核(既有行为不回归)。
5. **零新增内核调用:** 本卡不产生任何新 `commandClient`/`viewClient` 调用(审批写沿用 016)。
6. **Mock/演示零改:** 权限矩阵、审批卡、脱敏、剧本时间线逐位不变。

## 测试要求

vitest 共置。`space-role.test` 覆盖投影行为 1;access-view 渲染断言角色徽标存在;既有 `access`/`approval`/`session-store`/`changeset-store` 测试零回归。（审批人 actor 经 016 的写桥,已由 016 测试覆盖,本卡以走查文档 + 回归为准。）

## 验收标准

1. `corepack pnpm verify:web` 全绿。
2. `git diff --stat main` 仅含封闭清单(access/ + docs [+ 可选 css]);**不含任何 `data/**` 改动**;CSS 若动仅 append;每步一 commit。
3. 视觉:access 8b 每成员空间角色徽标;陈默数据/表达拆分清晰。
4. 手工链(PR 附摘录 + 落 `docs/验收-同源P4批4-backend走查.md`):`dev-up`→`?backend=1&ws=`→陈默身份改价被转审批→切王芸批准→内核落值且 `X-Actor-Id`=王芸→9c 内核权威叠加、6a 内核 aiChanges 旁路逐项确认联动→去 `?backend` Mock 全流程零回归→`git status` 干净。
5. PR 注明:ChangeState/PENDING_CONFIRM 缺口 + 017d 跟进(待 views `changeState` 客户端小卡)。

## 禁止事项

- 只动 `packages/web/src/unisource/access/**` 与本卡 docs;**禁触 `data/**`、016 写面、`changeSetStore` 本地审批 API、views/server/contracts**。
- **禁实装 ChangeState / PENDING_CONFIRM 状态机**(决策 1/2);**禁新增任何内核命令/查询调用**。
- 禁把 G2 投影下发内核 / 做真实资源级 RBAC(演示投影,安全边界注)。
- 禁改脱敏、权限矩阵、审批卡的既有行为与剧本时间线。
- 禁新增 npm 依赖;禁 localStorage 业务数据(仅 `ui.us.*`);禁在 `us-tokens.css` 之外散写色值;CSS 随组件同 commit 且只追加。

完成后停止,等待审查。
