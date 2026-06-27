# T-V33-FETCH-BIND — 修 fetch "Illegal invocation"(前端所有视图请求失效的根因)

**packages/web + packages/views 前端域,纯前端,零后端/契约。** 前置:main。
**最严重 bug(根因)**:工作台所有视图请求(objects/relations/tree/matrix…)全部失败,画布/表格/树永远空。浏览器 Console 报:
```
TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
  at ViewClient.get (view-client.ts:387)
```
后端 API 完全正常(直接/经代理访问都返回 6 间房),问题 100% 在前端这一行。

## 根因(已用 DevTools 定位)
`fetch` 被当作普通值传递、再以 `this.fetchFn(...)` 调用,丢失了对 `window` 的绑定 → 浏览器抛 "Illegal invocation"。涉及:
- `packages/web/src/app.tsx`:`fetchFn = fetch`(默认参数,~第 30 行),传入 `new ViewClient(baseUrl, fetchFn)` / `new CommandClient(baseUrl, fetchFn)`。
- `packages/views/src/api/view-client.ts`:`ViewClient` 构造默认 `fetchFn: FetchFn = fetch`(~206),`get()`/`post()` 里 `this.fetchFn(...)`(~387/393);`CommandClient` 同样默认 `= fetch`(若存在)。

## 范围(最小改动)
把"裸 fetch"换成**保持 window 绑定的包装**,任一处即可根治,建议两处都做以防回归:
- **A. app.tsx**:默认值
  ```ts
  fetchFn = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  ```
  (或 `globalThis.fetch.bind(globalThis)`。)
- **B. view-client.ts**:`ViewClient`(及 `CommandClient`,若有)构造函数的 `fetchFn` 默认值,从 `= fetch` 改为同样的包装 `= (input, init) => fetch(input, init)`,使任何不传 fetchFn 的调用也安全。
- **不改** get/post 的逻辑、不改任何请求 URL/语义。

## 封闭文件清单
**修改**:`packages/web/src/app.tsx`、`packages/views/src/api/view-client.ts`;按需相关 `.test.tsx`/`.test.ts`(若测试 stub 依赖默认 fetch)。
**零碰**:后端、契约、迁移、查询语义、样式、其它面板逻辑。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改请求 URL/语义。
- 修复后:进入"技术方案A"工作台,**图面板显示 6 个房间方块**(客厅/主卧/暗次卧/厨房/卫生间/西晒书房)+ 相邻连线;表格列 6 行;树/校验正常;Console **无 "Illegal invocation"**;底栏错误数 0。
- 不新增依赖;`corepack pnpm verify` 全绿;无回归。
- 分支 `feat/T-V33-fetch-bind` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 工作台画布默认呈现 6 个房间(room/adjacent),Console 无报错,错误数 0。
2. 点中"暗次卧",右侧属性/校验显示字段 + 红色规则灯(BLOCK);客厅/厨房/卫生间绿、主卧/西晒书房黄。
3. verify 全绿;无后端/契约 diff。
