# T-V33-FLOORPLAN-VIEW — 户型平面图视图(让画布对上原型那屏,纯前端)

蓝本:`docs/design/M-Next 户型工作台.dc.html`。
**packages/web 域,纯前端,零后端/契约。** 前置:main(已含派生进视图、SKIN-NODE、CMD-ACTOR 编辑闭环)。
定位:现状画布是**通用关系图**(抽象节点卡 + 网格),与原型的**户型平面图**(房间块按面积缩放、平面排布、角标灯)差距最大。本卡新增一个**"平面图"视图面板**,把室内房间渲染成原型那样的平面图块,复用现有数据与编辑闭环。

## 现状(已核实)
- 工作台视图标签:图 / 表格 / 矩阵 / 文档(`workbench.tsx` 的 `workbenchPanelDefinitions` + dockview)。
- room 对象已带:`length_m`/`width_m`/`orientation`/`window_area_m2`、派生 `area_fx`/`window_floor_ratio_fx`、`ruleStatus`(OK/WARN/BLOCK)、维度着色 `dimensionTone`。
- 选中→属性面板编辑→`updateFields`→`refreshViews`→视图刷新 的闭环已通(CMD-ACTOR 后)。

## 范围(纯前端,新增视图)
- **A. 新面板"平面图"**(新增 `floorplan-panel.tsx`,注册进 `workbench.tsx` 视图标签,可作室内工作空间默认视图):
  - 拉取 room 对象(`viewClient.objects(ws,"room",…)`)+ 邻接关系(`relations(...,"adjacent",…)`),复用 diagram-panel 的取数方式。
  - 每间房渲染成**圆角矩形块**:块尺寸**按 长×宽 等比缩放**(给一个像素/米的比例,设最小/最大尺寸防过大过小);块内显示**房间名(主)** + **面积芯片**(`area_fx`)+ **角标规则灯**(红/橙/绿,图标+色双编码);可选副信息(窗地比)。**克制,贴 dc.html,不堆字段。**
  - **布局(示意,非建筑精确)**:确定性排布——按某稳定顺序(如 usage/面积)行式紧凑摆放,块间留缝;尽量让有 `adjacent` 关系的房间相邻摆放(可选启发,不强求)。**注明是示意平面,坐标非真实空间。**
- **B. 维度叠加**:顶部维度切换(全部/光/热/风)切换时,**房间块原地按该维度重新着色**(复用 `dimensionTone`/`activeDimension` 逻辑),位置不动——对上原型"切到光,按采光重着色"的交互。
- **C. 交互闭环**:点房间块→`selection.select({entityType:"object",entityId})`(与图视图一致)→右侧属性面板加载→改"宽/窗面积"保存→`refreshViews`→**平面图块的面积/角标灯实时更新**。这就是在平面图上演示"改一处全联动"。
- **D. 样式**:全用 `--mn-*` 令牌,Fluent 浅色;块/灯/芯片对齐 dc.html;亮暗双主题。

## 封闭文件清单
**修改/新增**:`packages/web/src/workbench/floorplan-panel.tsx`(新)、`packages/web/src/workbench/workbench.tsx`(注册面板+标签)、`packages/web/src/styles.css`(平面图样式)、按需复用 `diagram-panel.tsx` 导出的取数/派生/维度工具(只引用,不改其逻辑)、相关 `.test.tsx`。
**零碰**:后端、契约、迁移、`packages/views` 数据逻辑、命令语义、其它面板行为。

## 红线 / 门禁
- 纯前端新增视图;**零后端/契约**;复用现有 view/command 客户端,不改数据来源/查询语义。
- 房间块尺寸/着色/派生/规则灯只用**真实数据**;布局为**示意**,明确不声称建筑精确坐标。
- 不破坏现有 图/表格/矩阵/文档 视图;新面板可关可开。
- 不新增依赖;`corepack pnpm verify` 全绿;对现有视图零回归;亮暗主题可用。
- 分支 `feat/T-V33-floorplan-view` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 工作台新增"平面图"标签;打开后 6 间房显示为**按面积缩放的圆角块**(客厅最大、卫生间最小),块内房间名 + 面积芯片 + 角标灯(暗次卧红、主卧/西晒书房橙、其余绿)。
2. 切"光/热/风"维度,房间块**原地重新着色**,位置不变。
3. 点"暗次卧"块→右侧改"窗面积"保存→该块面积/窗地比/角标灯**实时刷新**。
4. Fluent 浅色、亮暗可切;`错误 0`;verify 全绿;无后端/契约 diff。

## 跟进(本卡不做)
真实空间坐标(给 room 加 x/y/布局字段,做"可拖拽布局/真实平面")、SKIN-WIDGETS 组件化、文档/矩阵视图美化。
