# T-V33-SKIN-WIDGETS — 复用小组件(fx 芯片 / 规则灯 / provenance 护照 / 陈旧标)

蓝本:`docs/design/图元风格概念.dc.html`。
**packages/web 域,纯前端重构,零后端/契约、零行为变更。** 前置:main(SKIN-NODE 后;建议在 FLOORPLAN-VIEW 之前合,便于平面图复用)。
定位:把现在散落在 `object-node.tsx`/`inspector-panel.tsx` 里的 fx 芯片、规则灯、provenance、陈旧标抽成**统一可复用组件**,供节点 / 平面图 / 属性面板 / 表格一致使用,杜绝多份样式漂移。

## 范围(纯前端,提取+复用,不改观感与行为)
- 新增 `packages/web/src/workbench/widgets/`(或同级单文件),导出:
  - `<FxChip label value unit readOnly />` —— 浅底"后端实时·只读"派生芯片(承 SKIN-NODE 现样)。
  - `<RuleLamp status />` —— OK/WARN/BLOCK/UNKNOWN,色+图标双编码(承 object-node 现 `RuleLamp`)。
  - `<ProvenancePassport source freshness downstream? />` —— 来源 + 新鲜度(+ 可选下游数)。
  - `<StaleTag />` / 状态徽标(recomputing/stale/vetoed 等,供节点与平面图共用)。
- 改 `object-node.tsx`、`inspector-panel.tsx` 改用这些组件(**像素与行为保持一致**,纯重构)。
- 样式集中到组件 + `styles.css` 对应类,全部 `--mn-*` 令牌。

## 封闭文件清单
**新增/修改**:`packages/web/src/workbench/widgets/*`、`object-node.tsx`、`inspector-panel.tsx`、`styles.css`、相关 `.test.tsx`。
**零碰**:后端、契约、`packages/views` 数据逻辑、命令、视图请求。

## 红线 / 门禁
- 纯重构:**观感与行为零变化**(对照重构前后一致),只是收敛为共享组件。
- 全 `--mn-*` 令牌;亮暗双主题;规则灯保持色+图标双编码。
- 不新增依赖;`corepack pnpm verify` 全绿;零回归。
- 分支 `feat/T-V33-skin-widgets` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 节点与属性面板的 fx 芯片/规则灯/护照外观与之前一致,但来自统一组件。
2. 平面图视图(FLOORPLAN-VIEW)可直接复用这些组件(若该卡已合)。
3. verify 全绿;无后端/契约 diff。
