# T-V33-SKIN-EDGE — 连线样式(纯前端,对齐 Fluent 令牌 + 图元风格)

蓝本:`docs/design/图元风格概念.dc.html` + `docs/设计落地-Fluent界面与令牌.md` 的 SKIN-EDGE 段。
**packages/web 域,纯前端,零后端/契约。** 前置:main(已含 SKIN-NODE)。
定位:把画布连线从**硬编码色**改为 Fluent 令牌驱动,按关系类型/方向/状态区分,补齐"命中规则红""选中""未连灰虚"等态;户型"相邻(adjacent)"连线出一个干净样式。

## 现状(已核实)
- `packages/web/src/workbench/edges.tsx`:已有 `relationRoute`(orthogonal/curved)、`relationEdgeVisual`(按关系类型给色/粗细/虚实)、`DiagramEdgeStatus`(ACTIVE/UNLINKED)、`DiagramRuleState`(failed/normal)、label 渲染。
- **痛点**:颜色是**硬编码十六进制**(`#1677ff` 选中、`#d4380d` 规则命中、`#315b7d`/`#8a5a00` 关系类型),与全站 `--mn-*` Fluent 令牌不一致;`adjacent` 关系走默认 curved、用兜底色,没有专门样式。
- 规则命中态 `ruleState` 目前节点侧恒为 `normal`(diagram-panel TODO),边的 failed 态暂无数据来源——本卡**只把样式准备好**,不强行造数据。

## 范围(纯前端)
- **A. 颜色令牌化**:`relationEdgeVisual` 的硬编码色改为引用 `--mn-*`(SVG stroke 可用 `var(--mn-accent)` 等):
  - 选中 → `--mn-accent`;规则命中(failed)→ `--mn-bad`;未连(UNLINKED)→ `--mn-ink-3` 灰 + 虚线;
  - 层级类(contain/decompose)→ `--mn-border-3`/深色实线;依赖类(depend/require)→ `--mn-warn` 虚线;
  - `adjacent`(室内相邻)→ 给一个明确样式(如 `--mn-ink-3` 细实线或浅点线 + 无强箭头),区别于层级/依赖。
- **B. 方向与走线**:保留 orthogonal/curved 两种;箭头 marker 颜色随线色;`adjacent` 这种"对称邻接"可弱化或不显方向箭头(相邻无强方向)。
- **C. 标签**:连线标签底色/描边用 `--mn-surface`/`--mn-border`、文字 `--mn-ink-2`,小而清晰,不挡线。
- **D. 状态视觉**:default / 选中(粗+accent)/ 命中规则(粗+bad,样式就绪即可)/ 未连(灰虚)/ 悬停 高亮。
- **E. 复核守卫(顺带)**:确认 `tree-view.tsx`/`document-view.tsx` 对空 rootId、非 hierarchical 关系已不发请求(现已具备),如发现仍有空根请求则补齐。**后端 400 WARN 为无害日志噪声,不动后端。**

## 封闭文件清单
**修改**:`packages/web/src/workbench/edges.tsx`、`packages/web/src/styles.css`(连线/标签样式)、按需 `diagram-panel.tsx`(仅边数据组装,不改请求)、相关 `.test.tsx`。
**零碰**:后端、契约、迁移、`packages/views` 数据逻辑、视图请求语义、节点组件逻辑(SKIN-NODE 已定)。

## 红线 / 门禁
- 纯前端换皮;**零后端/契约**;不改请求/查询语义、不造假数据(failed 态只备样式)。
- 连线色全部走 `--mn-*` 令牌;亮/暗主题下都清晰。
- 不新增依赖;`corepack pnpm verify` 全绿;画布选择/连线/维度切换零回归。
- 分支 `feat/T-V33-skin-edge` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 户型画布里房间"相邻"连线样式干净、与 Fluent 一致(令牌色,非硬编码),选中变 accent 粗线。
2. 亮/暗主题下连线与标签都清晰;无功能回归。
3. `错误 0`;verify 全绿;无后端/契约 diff。

## 跟进(本卡不做)
"改宽→面积/规则灯实时重算"编辑闭环;SKIN-WIDGETS(芯片/规则灯/护照独立复用组件)。
