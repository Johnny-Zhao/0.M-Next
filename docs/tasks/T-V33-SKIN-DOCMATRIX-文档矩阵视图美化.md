# T-V33-SKIN-DOCMATRIX — 文档 / 矩阵 / 树视图 Fluent 美化(收齐其余视图)

蓝本:`docs/design/M-Next 工作台.dc.html`(整体观感)。
**packages/web + packages/views 前端域,纯前端换皮,零后端/契约。** 前置:main(SKIN 系列后)。
定位:图/节点/连线已 Fluent 化,但**文档、矩阵、树、表格**这几个视图还偏素/旧样。本卡把它们统一到 Fluent 令牌,使整窗一致。

## 范围(纯前端换皮)
- **文档视图**(`packages/views/src/document/document-view.tsx` + 样式):标题层级、正文、字段表、派生/规则标注用 `--mn-*`;空态友好(无 hierarchical 关系时给清晰提示而非空白)。
- **矩阵视图**(`matrix-view.tsx`/`matrix-panel.tsx`):表头/单元格/分页控件 Fluent 化;命中单元格用 `--mn-accent-bg`;规则相关用语义色。
- **树视图**(`tree-view.tsx`):缩进/连线/节点行 Fluent 化;非 hierarchical 关系给"该关系不支持树视图"提示(承前守卫)。
- **表格视图**(`table-panel.tsx`):表头/行/规则灯列 Fluent 化,行高紧凑。
- 全部 `--mn-*` 令牌,亮暗双主题;不改数据逻辑/请求/分页语义。

## 封闭文件清单
**修改**:`packages/views/src/document/document-view.tsx`、`packages/views/src/tree/tree-view.tsx`、`matrix-view.tsx`、`packages/web/src/workbench/{matrix-panel,table-panel,document-panel}.tsx`、`packages/web/src/styles.css`、相关 test。
**零碰**:后端、契约、迁移、视图请求/分页语义、命令。

## 红线 / 门禁
- 纯换皮:数据/请求/分页/排序行为零变化,只配色/版式/空态文案。
- 全 `--mn-*` 令牌;亮暗双主题;规则相关保持色+图标双编码。
- 不新增依赖;`corepack pnpm verify` 全绿;零回归。
- 分支 `feat/T-V33-skin-docmatrix` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 文档/矩阵/树/表格四视图观感与图/节点一致(Fluent 浅色、令牌色),亮暗可切。
2. 空态有清晰提示(尤其树/文档遇非 hierarchical 关系)。
3. verify 全绿;无后端/契约 diff。
