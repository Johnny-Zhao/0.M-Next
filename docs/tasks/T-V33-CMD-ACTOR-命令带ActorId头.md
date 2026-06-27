# T-V33-CMD-ACTOR — CommandClient 补 X-Actor-Id 头(写命令 400 的根因)

**packages/web + packages/views 前端域,纯前端,零后端/契约。** 前置:main。
**Bug**:工作台保存字段(及删连线等所有写命令)报 400。后端日志:
```
MissingRequestHeaderException: Required request header 'X-Actor-Id' ... is not present
```
根因:`CommandController` 的写命令端点要求 `X-Actor-Id` 头标明操作者,但前端 `CommandClient.post` 只发了 `content-type`,**漏带 actor 头**(对比:`ViewClient.post` 是带的)。因此 `updateFields`/`createRelation`/`unlink` 全部 400。**这是"改一处全联动"编辑闭环唯一的堵点——闭环代码本身已完整。**

## 现状(已核实)
- `packages/views/src/api/command-client.ts` 的 `private post(...)`:`headers: { "content-type": "application/json" }`,**无 X-Actor-Id**。
- `CommandClient` 构造为 `(baseUrl, fetchFn)`,**不持有 actorId**。
- `app.tsx`:`new CommandClient(baseUrl, fetchFn)`(在登录前创建);登录后 `actorId` 存在 App state(`onLogin=setActorId`)。
- 参照:`view-client.ts` 的 `post` 已带 `"X-Actor-Id": actorId`。

## 范围(最小改动)
- **A. CommandClient 持有并发送 actor**:
  - 加可变 actor:`setActorId(actorId: string): void`(或构造可选第三参),内部存 `actorId`。
  - `post(...)` 的 headers 增加 `"X-Actor-Id": this.actorId`(actor 缺失时可抛清晰错误"未登录/缺少 actor",避免再发出无效请求)。
- **B. app.tsx 注入 actor**:`actorId` 变化时同步给 client——`useEffect(() => { if (actorId) commandClient.setActorId(actorId); }, [actorId, commandClient])`(ViewClient 不需要,因其 post 已逐次传 actorId)。
- **不改**命令 payload、URL、后端、任何契约。

## 封闭文件清单
**修改**:`packages/views/src/api/command-client.ts`、`packages/web/src/app.tsx`;按需相关 `.test.ts(x)`。
**零碰**:后端、契约、迁移、视图查询、命令语义/payload、样式。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改命令 payload/URL/语义。
- 修复后:选中房间→改"宽/窗面积"→保存**成功(2xx)**,无 400;`refreshViews` 后节点面积/窗地比/规则灯随之更新。
- 删连线等其它写命令同样恢复(post 统一带头)。
- 不新增依赖;`corepack pnpm verify` 全绿;只 add 本卡相关文件。
- 分支 `feat/T-V33-cmd-actor` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 选中"暗次卧"→把"宽"3 改 5→保存成功;画布面积芯片由 10.2 变 17（3.4×5），窗地比重算;规则灯按阈值刷新。
2. 把"窗面积"调大→窗地比上升→规则灯可能由阻断转告警/达标。
3. 底栏"错误"不再因保存增长;verify 全绿;无后端/契约 diff。
