# T-V33-WB-DEFAULTS — 工作台默认指向种子户型 + 修参数框卡死(纯前端)

**packages/web 域,纯前端,零后端/契约。** 前置:main。
背景:dev 档已 seed 室内 Demo(workspace `11111111-1111-4111-8111-111111111111`,含 floorplan + room,关系 contains/adjacent)。但工作台默认参数是 `demo_object / depends_on / aaaa…-root`,指向不存在的对象,画布空;且**手动编辑这三个参数框会导致整页卡死**(实测删字即卡)。本卡让工作台开箱即指向户型,并修掉编辑卡死。

## 现状(先验证)
- `packages/web/src/workbench/workbench.tsx`:
  - `useState("demo_object")` / `useState("depends_on")` / `useState("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")` 三个默认值。
  - 顶栏三个 `<input>`(对象类型/关系类型/根对象)`onChange` 直接 set。编辑/清空时页面冻结 —— 排查是否每次按键即触发重查/重渲染(React Flow 或 view 订阅同步重算)导致主线程卡死。
- 室内 profile 真实类型码:objectType ∈ {`floorplan`,`room`};relation ∈ {`contains`,`adjacent`}(见 `packages/domains/interior-design/profile.manifest.json`)。

## 范围
- **A. 改默认值**(让画布开箱显示房间相邻图):
  - objectType 默认 `room`
  - relationType 默认 `adjacent`
  - rootId 默认 `""`(空,查全工作空间)
- **B. 修参数框卡死**:让编辑这三个输入框**不再冻结页面**。最小改法优先:输入只更新本地状态、**查询仅在点"刷新"时触发**(若当前是 onChange 即查/即重算,改为受控输入 + 刷新按钮才查);或对空值/无效值做保护,避免触发无界查询或同步重排。不改查询语义,只改触发时机/健壮性。

## 封闭文件清单
**修改**:`packages/web/src/workbench/workbench.tsx`(默认值 + 输入触发时机),按需其配套 `.test.tsx`。
**零碰**:后端、契约、迁移、`packages/views`、其它面板数据逻辑、令牌/样式。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改查询语义(只改默认值与触发时机)。
- 编辑三个参数框不再卡死;空 rootId 安全(不崩、不挂)。
- 进入室内 Demo 工作空间后,画布默认呈现房间(room/adjacent),无需手动改参数。
- 不新增依赖;`corepack pnpm verify` 全绿;对其它工作空间无回归(默认改了,但仍可手动改回任意类型)。
- 分支 `feat/T-V33-wb-defaults` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. dev 起后端(已 seed)+ 前端 5173,登录→点"技术方案A"→工作台画布**默认就有房间**(客厅/主卧/次卧…),房间间有相邻连线,无需手动敲参数。
2. 手动编辑对象类型/关系类型/根对象三个框,**页面不卡死**;清空 rootId 不崩。
3. 点中房间,右侧属性/校验显示其字段与规则灯。
4. verify 全绿;无后端/契约 diff。
