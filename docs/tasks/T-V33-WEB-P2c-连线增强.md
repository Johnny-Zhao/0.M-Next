# T-V33-WEB-P2c — 前端 P2c:连线增强(端口 / 自动布线 / 标签 / 类型·状态)

蓝本:`功能全集清单-制图工作台.md` A 区 + 排期 P2c。**packages/web 域,纯前端**。前置:P1(React Flow 连线 + `createRelation` 就绪)。**与 P2a/P2b/P2d 不相交,可并行。**

定位:把连线从"一根默认贝塞尔"升级为工程图级——端口锚点、正交/曲线自动布线、连线标签、按关系类型/方向/状态着色。**建/删连线经 `CommandClient` 关系命令**;走线/标签为视图渲染。

## 范围
- **端口 / 锚点**:节点四周连接点(React Flow `Handle`),从锚点拉线建关系;连线落点高亮。
- **自动布线**:连线类型支持 正交(`step`/`smoothstep`)与 曲线(`default` 贝塞尔)切换;默认按关系类型取一种。
- **连线标签**:边中点显示关系类型/名称(自定义 edge 标签)。
- **类型 / 方向 / 状态视觉**:实线/虚线·粗细·箭头区分关系类型;方向箭头;状态 active/unlinked(虚/灰);命中规则的边红色;选中态。复用 Design 的连线规范(`平台UI-图元与令牌-ClaudeDesign.md`)作视觉蓝本。
- **建/删关系经命令**:从锚点完成连接 → `CommandClient` 建关系;删边 → 删关系命令。

## 封闭文件清单
**修改**:`packages/web/src/workbench/diagram-panel.tsx`(Handle、edge 类型、onConnect 经命令)、`styles.css`
**新增**:`packages/web/src/workbench/edges.tsx`(自定义 edge:走线/标签/类型状态)、`ports.tsx`、`edges.test.tsx`
**零碰**:`packages/views/**` 源、后端、契约、迁移。

## 红线 / 门禁
- **建/删关系一律经 `CommandClient`**(AG-110);走线样式/标签/类型映射为纯视图。
- 不编造后端没有的关系状态/规则命中字段;视图无则 TODO 标注。
- 不新增依赖;不碰 views 源/契约/迁移;`corepack pnpm verify` 全绿。
- 分支 `feat/T-V33-web-p2c` 提交不合并;`git merge main` 拉平;完成发 diff --stat + web 测试汇总。

## 验收
1. verify 全绿;测试:从锚点连接触发 `createRelation`(mock 断言)、edge 按类型渲染正交/曲线、标签显示、删边经命令。
2. 关系建/删经命令、UI 重取;类型/方向/状态视觉正确(状态字段缺则 TODO,不编造)。
3. 无后端/契约/迁移 diff;views 源零改;无新依赖。

## 跟进(本卡不做)
连线拐点(waypoints)手动编辑、跨线跳接(jump-over)、关系状态/规则命中需 view-API 字段(随 P3d 一并人发起契约)。
