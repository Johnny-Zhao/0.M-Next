# T-V33-WEB-P3c — 维度信息视图叠加(demo,前端命名约定,零后端)

蓝本:`北极星-制图工作台-定稿.md` §4 维度轴 + `平台UI-维度轴单屏-ClaudeDesign.md`(《城市天际线》信息视图)。**packages/web 域,纯前端,零后端/契约**。前置:main(含 P2 + SKIN object-node)。

定位:在图编辑画布上加一根**维度轴切换器**(能量 / 热 / 质量 / 全部),切维度时**模型(节点/连线)不动,只换叠加**——按维度过滤/高亮每个 `ObjectNode` 显示的字段 + 语义着色。**维度归类暂用前端命名约定**(等 ③-正式:元模型 `dimension` 标签 + view-API 后,再换成后端真值)。

## 范围
- **A. 维度归类(命名约定,临时)**:新增 `packages/web/src/workbench/dimensions.ts`——
  - 配置 `DIMENSIONS = [{id:"energy",label:"能量",match:code=>/^energy[_-]|能量|soc|余量/i…}, {id:"thermal",label:"热",…}, {id:"mass",label:"质量",…}]`(可扩);
  - `fieldDimension(code): dimId|null`、`groupByDimension(fields)`、纯函数(便于测试)。
  - **注释标明:这是临时命名约定,正式维度走元模型 `dimension` + view-API(见设计稿 ③);约定与正式标签的映射要可平滑替换。**
- **B. 切换器(渐进式展开,§3bis)**:DiagramPanel 顶部加 `维度:[全部][能量][热][质量]` 入口(state `activeDimension`),默认"全部"。
- **C. 叠加(模型不动、只换层)**:`activeDimension≠全部` 时,`objectNodeData()` 把 `ObjectNode` 的 `fields` 预览**过滤为该维度字段**(命名约定),并按该维度代表值/规则态做语义高亮(复用 tokens 语义色);"全部"时维持现状。**节点位置/连线/端口一律不动**(无损切换)。
- **D. 图例 + 空态**:显示当前维度色带/说明;某对象在该维度无字段 → 节点显"该维度无数据",不编造。

## 封闭文件清单
**修改**:`diagram-panel.tsx`(维度 state + 切换器 + 传 activeDimension 进 objectNodeData)、`object-node.tsx`(按需:接受已过滤字段/维度态)、`styles.css`(切换器 + 图例,追加)
**新增**:`dimensions.ts`、`dimensions.test.ts`
**零碰**:后端、契约、迁移、`packages/views` 源(只读用现有 `object.fields`)、p2c 边/端口逻辑。

## 红线 / 门禁
- **纯前端、零后端/契约**;维度只读现有 `object.fields`,**命名约定临时**且注释标清"待元模型 dimension 标签替换",不伪造维度数据。
- **无损切换**:切维度只改节点字段预览/着色,**不动位置/连线/选择**;不发命令。
- 不新增依赖;`corepack pnpm verify` 全绿(web vitest/lint/type-check);`dimensions.ts` 纯函数有单测。
- 分支 `feat/T-V33-web-p3c` 从当前 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + `pnpm --filter @m-next/web test` 汇总。

## 验收
1. verify 全绿;`dimensions.ts` 单测覆盖归类(命中/未命中/多维度)。
2. 切换器:切"能量"→节点只显能量类字段 + 该维度高亮;切"全部"→恢复;**位置/连线不变**(断言切换前后节点 position 不动)。
3. 无后端/契约/迁移 diff;无新依赖。

## 跟进(本卡不做)
③-正式:元模型加 `dimension` 标签 + `…/views/dimensions` 端点(人发起契约),前端把命名约定换成后端真值;3D/几何维度热力(待 3D 面板);跨维度一致性(④)。
