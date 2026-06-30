# T-V35-C4 — 验证覆盖仪表 + 缺口高亮(灯塔线·第四步)

> **packages/views + packages/web 域,纯前端,零后端/契约/迁移/依赖。** 前置:C3(覆盖汇总端点)、并复用既有矩阵端点。
> 灯塔领域的"门面":把验证闭环做成一眼可读的覆盖仪表 + 缺口高亮 + 追溯下钻。

## 目标
新增**验证覆盖仪表**:读 C3 汇总展示 已验证/未验证/失败 滚动 + 缺口高亮;读矩阵(requirement×test_case via verified_by)展示覆盖矩阵;点缺口/单元格下钻追溯。

## 现状(已核实)
- 后端只读端点已就绪:`/views/verification-coverage`(C3 汇总)、`/views/matrix`(可配行列,支持 requirement×test_case×verified_by)、`/views/rule-status`、`/views/lineage`。
- 通用视图 + perspective + SelectionCoordinator 在;`view-client` 走 `/views/*`。

## 范围(纯前端)
- **A. 覆盖概览**:读 `verification-coverage` —— verified/unverified/failed 计数(环形/条形 + 语义色 `--mn-*`);总覆盖率。
- **B. 覆盖矩阵**:复用矩阵视图(requirement×test_case×verified_by),单元格按状态(通过/失败/缺)语义色。
- **C. 缺口高亮 + 下钻**:缺口列表(未验证+失败需求,含原因);点某需求 → 经 SelectionCoordinator 联动高亮其追溯链(derives/verified_by/produces);点矩阵单元格选中两端。
- **D. 状态/样式**:空态(无 MBSE 数据)/加载骨架;`--mn-*` 令牌、Fluent、亮暗双主题;大集合分页。
- **E. 不改**:后端/端点、写入路径;只读这些端点,不触发计算。

## 封闭文件清单
**修改/新增**:`packages/web/src/`(验证仪表面板 + 缺口/下钻交互 + test)、接入 workbench/shell 入口 + 样式、`packages/views/src/api/view-client.ts`(verification-coverage 只读方法,若 C3 未带)。
**零碰**:后端、契约、命令、读模型、其它面板内部逻辑。

## 红线 / 门禁
- **纯前端,零后端/契约/迁移/依赖**;只读端点,不触发计算/转换。
- 现有视图/功能零回归;`corepack pnpm verify` 全绿;亮暗双主题。
- 分支 `feat/T-V35-c4-verification-dashboard-fe` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡文件;发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 打开 MBSE Demo,验证仪表显示覆盖率 + verified/unverified/failed 概览(对得上 C3 数据)。
2. 覆盖矩阵按状态着色;点缺口/单元格联动高亮追溯链;空态/加载/亮暗友好。
3. verify 全绿;无后端/契约 diff。

## 跟进(本卡不做)
按 capability/phase 透视;覆盖率趋势(接时序);导出验证报告(docx/pdf)。
