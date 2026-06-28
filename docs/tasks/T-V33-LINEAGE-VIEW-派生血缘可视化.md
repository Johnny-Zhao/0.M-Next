# T-V33-LINEAGE-VIEW — 派生值血缘可视化(可追溯到底)

**packages/web 域,纯前端,零后端/契约。** 前置:main(后端 `/views/lineage` 已有,`viewClient.lineage` 已封装)。
定位:点一个派生值(面积/窗地比),清晰看到它的**推导链**(由哪些字段/派生算出)与**下游**(谁依赖它),把"数据驱动 + 可追溯"的治理卖点做实。现 inspector 有简陋的"血缘"折叠;本卡升级为可读的推导视图,并从节点 fx 芯片也能唤起。

## 现状(已核实)
- 后端 `GET /views/lineage?objectId&fieldCode` → `LineageView{ objectId, fieldCode, upstream[], algorithm{kind,ref}, downstream[], partial, truncated }`;`view-client.ts` 有 `lineage(...)`。
- `inspector-panel.tsx` 的 `FieldLineage`:点"血缘"列出 upstream 节点(很素)。
- 派生定义:`area_fx = field('length_m') * field('width_m')`、`window_floor_ratio_fx = field('window_area_m2') / field('area_fx')`(链式)。

## 范围(纯前端)
- **A. 血缘视图组件**(新 `lineage-view.tsx` 或同级):给定 `(objectId, fieldCode)`,拉 `lineage` 渲染一张**可读推导卡/小树**:
  - 顶部:目标派生值(名称 + 当前值 + 单位)。
  - **推导式**:用 `algorithm`(kind: stored/derived/rule, ref=表达式)展示"如何算"(如 `面积 = 长 × 宽`);把 ref 里的 `field('length_m')` 美化为中文字段名 + 当前值(从已加载对象字段取,取不到就显代号)。
  - **上游 upstream**:列出/连出它依赖的字段与派生(链式,如 窗地比 ← 窗面积、面积 ← 长、宽),标注 stored/derived。
  - **下游 downstream**:谁依赖它(有则列,无则"无下游")。
  - `partial/truncated` 给"(部分/已截断)"提示,不杜撰。
- **B. 唤起入口**:
  - 属性面板派生区:把 `FieldLineage` 升级为本组件(点派生值/"血缘"按钮弹出)。
  - 画布节点 fx 芯片:点芯片 → 唤起该派生值的血缘(弹出/侧栏);复用同组件。
- **C. 样式**:`--mn-*` 令牌、Fluent、亮暗;推导式用 `--mn-mono` 等宽;弹出可关、不挡操作。
- **D. 不改**:后端、lineage 请求语义、派生计算;只做呈现。

## 封闭文件清单
**新增/修改**:`packages/web/src/workbench/lineage-view.tsx`(新)、`inspector-panel.tsx`(用新组件替 FieldLineage)、`object-node.tsx` + `diagram-panel.tsx`/`floorplan-panel.tsx`(fx 芯片可点→唤起,按需经回调/selection)、`styles.css`、相关 test。
**零碰**:后端、契约、`packages/views` 数据逻辑(只调既有 `lineage`)、命令。

## 红线 / 门禁
- 纯前端;**零后端/契约**;只调既有 `/views/lineage`,不改其语义、不造数据(partial/truncated 如实标注)。
- 现有 inspector/节点功能零回归;弹出层可关、可访问(aria)。
- 不新增依赖;`corepack pnpm verify` 全绿;亮暗双主题。
- 分支 `feat/T-V33-lineage-view` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 选中"暗次卧",属性派生区点"面积"→ 弹出血缘:`面积 = 长(3.4) × 宽(3.0) = 10.2㎡`,上游列出 长/宽,下游列出 窗地比。
2. 点"窗地比"→ 链式血缘:窗地比 ← 窗面积、面积(面积再 ← 长、宽)。
3. 画布节点 fx 芯片点击也能唤起同一血缘视图。
4. partial/truncated 如实标注;亮暗可切;verify 全绿;无后端/契约 diff。

## 跟进(本卡不做)
血缘做成可视图谱(节点连线)、跨对象血缘、规则命中溯因。
