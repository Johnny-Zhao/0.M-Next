# T-V33-MATRIX-COVERAGE — 矩阵视图升级为可用覆盖/N² 矩阵(可配置行列关系)

蓝本:`docs/design/M-Next 工作台.dc.html`。
**packages/web 域,纯前端,零后端/契约。** 前置:main(后端 `/views/matrix` 已有,`viewClient.matrix(rowType,colType,relationType,…)` 已封装;已有第二领域技术方案)。
定位:矩阵视图当前较弱、行列关系写死(room×room×adjacent)。本卡做成**可配置行列+关系**的真覆盖/N² 矩阵:室内可看房间相邻,技术方案可看 **需求×系统 覆盖**(satisfies/contains),体现"多重表达 + 可追溯"。

## 现状(已核实)
- `matrix-view.tsx` / `matrix-panel.tsx`:调 `viewClient.matrix(rowType,colType,relationType,rowPage,rowSize,colPage,colSize)`;行列关系类型偏写死(默认 room/room/adjacent)。
- 后端 matrix 端点支持任意 rowType/colType/relationType;真实数据已有(室内 room/adjacent;技术方案 requirement/system + satisfies/contains 等,以 manifest 为准)。

## 范围(纯前端)
- **A. 可配置行列+关系**:矩阵面板顶部加三个选择器——**行类型 / 列类型 / 关系类型**(从当前工作空间的 `object-types` 与已知关系类型填充;默认取该工作空间合理项:室内 room×room×adjacent,技术方案 requirement×system×satisfies/contains)。切换即重新拉取。
- **B. 矩阵渲染**:行=行类型对象、列=列类型对象;**单元格**标记两者间是否存在该关系(✓/实心点),命中规则或缺失按语义色(`--mn-*`);表头固定、可横纵滚动;分页(沿用端点分页参数)。
- **C. 交互**:点单元格→选中对应行/列对象(走 SelectionCoordinator,联动高亮);点表头对象→选中该对象。空态/加载骨架友好。
- **D. 样式**:`--mn-*` 令牌、Fluent、亮暗;等宽对齐;大矩阵性能稳(限定 page size)。
- **E. 不改**:matrix 端点语义、数据请求分页语义;只做配置 + 呈现 + 选中联动。

## 封闭文件清单
**修改**:`packages/views/src/matrix/matrix-view.tsx`、`packages/web/src/workbench/matrix-panel.tsx`、`styles.css`、相关 test;按需复用 `view-client.objectTypes`/SelectionCoordinator(不改其语义)。
**零碰**:后端、契约、命令、其它面板内部逻辑。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改 matrix 端点/分页语义,只加行列关系配置 + 渲染 + 选中联动。
- 默认配置按工作空间合理推断(室内/技术方案各有默认),无合适项时给空态、不崩。
- 现有功能零回归;`corepack pnpm verify` 全绿;亮暗双主题。
- 分支 `feat/T-V33-matrix-coverage` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 室内 Demo 矩阵:room×room×adjacent,相邻房间单元格打勾;点单元格联动高亮两端房间。
2. 技术方案 Demo 矩阵:可选 requirement×system(或 manifest 实际覆盖关系),呈现需求对系统的覆盖;点格选中。
3. 行列关系可切换、即时刷新;空态/加载友好;亮暗可切;verify 全绿;无后端/契约 diff。

## 跟进(本卡不做)
覆盖率统计/缺口高亮;导出矩阵;跨领域矩阵模板预设。
