# T-V33-DERIVED-VIEW — 派生值进对象视图 + 节点 fx 芯片显示真值(闭环第一步)

定位:让户型卡片上的 **fx 派生芯片显示真实的面积 / 窗地比**(现在是 `TODO(view-API): 派生值未提供` 占位)。这是"改一处全联动"可演示的前置:派生值先要在视图里看得见。
**涉及 packages/server(视图查询)+ packages/views(DTO)+ packages/web(节点渲染)。读路径,零写入语义变更、零迁移。** 前置:main。

## 现状(已核实)
- 派生已定义(`packages/domains/interior-design/profile.manifest.json` 的 `derived`):room→`area_fx`(面积=长×宽)、`window_floor_ratio_fx`(窗地比=窗面积/面积);floorplan→`total_area_fx`。
- 计算器 `DerivedEvaluator.evaluate(workspaceId, objectId, fieldCode)` 已存在且可用(推荐位 `ViewQueryController:254` 已在调用)。
- `GET /views/objects`(`ViewQueryController.objects`→`ReadModelRepository.objects`)只回 `rm_object.fields`(**仅存储字段**),不含派生 → 前端 `objectNodeData`(`diagram-panel.tsx`)扫不到 `_fx` 字段 → 芯片显示占位。
- 规则状态已单独算好回传(规则灯已正确),**派生链本身是通的,仅未在对象视图暴露**。
- 附带 bug:`tree` 视图用 `relationType=adjacent` 查,但后端要求 hierarchical(`ViewQueryController.tree` 校验)→ 500(底栏"错误 1")。

## 范围
- **A. 后端:对象视图返回派生值(只读、加法式,不动写入/迁移)**
  - 在 `ViewQueryController.objects` 与 `objects/{id}` 的返回里,为每个对象附带其类型的派生字段计算结果。
  - 取派生码:用既有 `DerivedFieldRepository`(按 objectType 列派生码);逐个 `DerivedEvaluator.evaluate(workspaceId, objectId, code)`。求值失败/缺输入时该字段省略或置 null,**不可让整个列表 500**(单字段异常要吞掉并跳过)。
  - **暴露方式(二选一,优先前者,契约更清晰)**:
    1. 在 `ObjectView`/`ObjectDetailView` DTO 增加只读字段 `derived: Map<String,Object>`(加法、不破坏现有字段);
    2. 或并入现有 `fields` map(键用 `area_fx` 等)。
  - 性能:列表逐对象求值,注意 N 不大(房间数十级)即可;如有批量接口优先用。
- **B. 前端:DTO + 节点渲染**
  - `packages/views/src/api/view-client.ts`:`ObjectView`/`ObjectDetail` 按 A 的形状加 `derived`(或沿用 fields)。
  - `packages/web/src/workbench/diagram-panel.tsx` `objectNodeData`:fx 芯片改为读真实派生值(面积/窗地比),去掉 `TODO(view-API): 派生值未提供`;无派生时才回退占位。芯片标注"后端实时/只读"。
- **C. 顺带修"错误 1"**:树面板/文档面板用非 hierarchical 关系(adjacent)查 tree 时不要直接打 500——前端在关系非 hierarchical 或 rootId 为空时**跳过 tree 请求**(不发或显示"该关系不支持树视图"),消除底栏报错。**只改前端守卫,不改后端校验语义。**

## 封闭文件清单
**修改**:`packages/server/src/main/java/com/mnext/server/ViewQueryController.java`(+ 其 DTO `ObjectView`/`ObjectDetailView` 所在文件、按需 `ReadModelRepository` 仅读);`packages/views/src/api/view-client.ts`;`packages/web/src/workbench/diagram-panel.tsx`(+ 树面板守卫文件);按需相关测试。
**零碰**:写入命令/语义、Flyway 迁移、`rm_*` 表结构、规则/派生的计算逻辑本身(只调用,不改)、样式令牌。

## 红线 / 门禁
- **零写入语义变更、零迁移、零 rm_* 表结构变更**;派生只在读路径"算了再回",不落库。
- 单个派生字段求值失败必须降级(省略/ null),**不得让 `/views/objects` 整体 500**。
- DTO 变更为**加法式**(不删/不改既有字段),前后端同步。
- 不新增依赖;`corepack pnpm verify` 全绿(含后端 E2E);对其它视图零回归。
- 分支 `feat/T-V33-derived-view` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + 测试汇总。命中红线(尤其需要动迁移/写入/契约破坏)**停下回报,不夹带**。

## 验收
1. 进工作台,房间卡片 fx 芯片显示**真实面积/窗地比**(如 客厅面积≈23.5㎡、暗次卧窗地比≈0.078),非占位。
2. 暗次卧仍 BLOCK(红);数值与规则状态自洽。
3. 底栏"错误"数为 0(树视图不再 500)。
4. verify 全绿;无迁移/写入/表结构 diff。

## 跟进(本卡不做)
"改字段→重算"编辑闭环(给房间字段一个编辑入口,经命令写入→投影重算→视图刷新)、SKIN-NODE 节点全状态美化。
