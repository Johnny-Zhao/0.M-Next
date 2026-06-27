# T-V33-SELECTION-SYNC — 选中联动高亮(画布/平面图/树/属性 一体)

**packages/web 域,纯前端,零后端/契约。** 前置:main(已含 PANELS-AUTOLOAD / FLOORPLAN-VIEW)。
定位:现在各面板选中相对孤立。本卡让**选中状态单一来源、跨视图双向同步并高亮**——在任一视图选中一个对象,图/平面图/模型树同步高亮、属性区自动加载,工作台"连成一体"。

## 现状(已核实)
- 已有 `SelectionCoordinator`(`packages/views/.../selection-coordinator`),按 workspace 维护选中实体;inspector 订阅它(选中对象→加载明细)。
- 图面板 `diagram-panel` 有 `onNodeClick → selection.select({object})` 与选中态高亮;但**平面图 `floorplan-panel`、模型树 `tree-panel`** 与选中协调器的双向联动不全:在树/平面图选中未必同步到图与属性,反之图选中未必高亮树/平面图。

## 范围(纯前端,复用 SelectionCoordinator)
- **A. 统一来源**:所有面板的"选中"都走 `SelectionCoordinator`——发布 `select({entityType:"object", entityId})`,并 `subscribe` 当前选中。不另起一套选中状态。
- **B. 双向同步 + 高亮**:
  - 在**模型树**点节点 → select → 图/平面图对应块**高亮**、属性区加载该对象。
  - 在**平面图**点房间块 → select → 树对应行高亮、图高亮、属性加载(平面图已有点选,补齐订阅高亮)。
  - 在**图画布**选节点 → 树对应行 + 平面图对应块高亮。
  - 选中态视觉统一(描边/底色用 `--mn-accent`/`--mn-accent-bg`,对齐 SKIN-NODE/dc.html)。
- **C. 悬停(可选,不强求)**:hover 跨视图弱高亮,弱于选中态;拿不准就只做选中。
- **D. 清理**:切换工作空间/取消选中时各视图同步清高亮(复用 `selection.switchWorkspace`)。
- **E. 不改**:选择协调器的对外 API 语义(只接更全)、数据请求、命令。

## 封闭文件清单
**修改**:`packages/web/src/workbench/{tree-panel,floorplan-panel,diagram-panel}.tsx`、按需 `packages/views/src/selection/selection-coordinator.ts`(仅在不破坏现有 API 前提下补能力)、`styles.css`、相关 test。
**零碰**:后端、契约、视图请求/命令、inspector 加载逻辑(已订阅,无需改)。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改数据请求、不改 SelectionCoordinator 现有公共 API 语义(只增不破)。
- 选中高亮跨图/平面图/树一致;属性区随选中加载(沿用现状)。
- 现有功能零回归(编辑闭环、维度切换、面板加载照常)。
- 不新增依赖;`corepack pnpm verify` 全绿;亮暗双主题。
- 分支 `feat/T-V33-selection-sync` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 模型树点"暗次卧"→ 图与平面图对应块高亮、属性区显示其字段/规则灯。
2. 平面图点"客厅"→ 树高亮该行、图高亮该节点、属性加载。
3. 图选中 → 树/平面图同步高亮;取消/换工作空间高亮同步清除。
4. 选中态视觉统一(accent);verify 全绿;无后端/契约 diff。
