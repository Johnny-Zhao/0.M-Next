# T-V33-WEB-SKIN-v2 — 换肤(基于当前 main 重做,对齐 p2c 边/端口模型)

蓝本:Design `bs-glyph.html` + `平台UI-图元与令牌-ClaudeDesign.md`;**复用旧 skin 分支已写好的 `object-node.tsx` + `tokens.css`(在 `feat/T-V33-web-skin` 上,可 checkout 取用)**。**packages/web 域,纯前端、纯表现层**。
**前置 / 关键:从当前 main 起分支**(已含 P2a/b/c/d:p2c 的富边模型 `DiagramEdgeData` + 端口 `portHandleId`/`relationPortSides`、p2a 的右键/选择、p2b 的对齐/网格、p2d 命令面板)。**不要用旧 skin 分支直接合**——它基线旧、节点端口与 p2c 对不齐,会再次冲突。

定位:把朴素节点换成 Fluent 图元卖相。**只换节点的数据/渲染 + 主题样式;p2c 的边模型、连线/端口路由、各交互逻辑一律不动。**

## 范围
- **A. 令牌**:复用旧 skin 的 `packages/web/src/tokens.css`(Fluent,亮/暗双主题,`--mnext-*` 变量),原样引入;在入口处 import 一次。
- **B. 图元节点**:复用旧 skin 的 `object-node.tsx`(`ObjectNode` 渲染 + `ObjectNodeData`:code/typeVariant/fields/fxText/ruleStatus/provenanceText/visualState/readonly + RuleLamp + TypeIcon),但**对齐 p2c 端口**(见红线①)。
- **C. diagram-panel 接入(改动最小化)**:
  - `nodeTypes = { object: ObjectNode }`;`DiagramNode = ObjectFlowNode`(object-node 的类型);
  - `objectsAndRelationsToFlow` 的**节点侧**改为产出 `ObjectNodeData`(从 `ViewObject` 映射:code=对象代号或 id 短码、typeVariant 由 objectType 归类 subsystem/component/interface/requirement、fields=前 1–2 个存储字段预览、fxText=派生(沿用现 `objectFxText`)、ruleStatus 暂 `"TODO"`(view-API 未提供,不编造)、provenanceText 暂用 `status`/占位、visualState 暂 `"default"`、readonly 由 status/来源判定);
  - **边侧完全保持 p2c**(`DiagramEdgeData`、ports、`portHandleId`、`relationRoute`、`dataRelationMarker` 不动)。
- **D. 样式**:复用/迁移旧 skin 的 `styles.css` 中 `.object-node*` / `.rule-lamp*` / `.fx-chip` / `.provenance-passport` 等块 + 用 `tokens.css` 变量;追加,不破坏现有 P2 样式。
- **E. dockview 主题**:面板标题/标签套 Fluent 令牌(复用旧 skin 的 `workbench.tsx` 主题改动思路)。

## 封闭文件清单
**修改**:`diagram-panel.tsx`(仅节点侧:nodeTypes + objectsAndRelationsToFlow 节点映射)、`styles.css`(追加)、`workbench.tsx`(主题类)、入口(import tokens.css)
**新增**:`object-node.tsx`、`tokens.css`(从旧 skin 分支取)、`object-node.test.tsx`
**零碰**:p2c 的边/端口逻辑、`edges.tsx`/`ports.tsx`、`packages/views/**` 源、后端、契约、迁移。

## 红线 / 门禁
- **① 端口对齐(关键)**:`ObjectNode` 的 `<Handle>` 必须带 p2c 的 id —— 用 `portHandleId("source"|"target", side)`,且覆盖 `relationPortSides`/`edgePorts` 可能产出的 side,使 p2c 的边能连上;**最稳做法:在 ObjectNode 内直接复用 `ports.tsx` 的 `PortHandles`**,而不是另写一套无 id 的 Handle。
- **② 纯表现层**:不改取数/命令/选择/改即重算/边逻辑;只换节点 data 映射 + 渲染 + 样式。
- **③ 不编造**:ruleStatus / provenance / 维度等 view-API 未提供的,置 `TODO`/占位,不伪造数据。
- 不新增依赖;不碰 views 源/契约/迁移;`corepack pnpm verify` 全绿(含 web vitest/lint/type-check/format),`check-no-skipped` Skipped:0。
- 分支 `feat/T-V33-web-skin-v2` 从**当前 main** 起、提交不合并;基线落后只 `git merge main`;完成发 `git diff --stat main` + `pnpm --filter @m-next/web test` 汇总。

## 验收
1. verify 全绿;测试:ObjectNode 各 typeVariant/visualState/ruleStatus 渲染(blocked/stale/vetoed/fx 芯片/规则灯/护照)、亮暗主题。
2. **行为不回归**:连线(p2c 端口/路由)、删边、选择/右键/快捷键、对齐/网格、命令面板、改即重算——一切照旧,只外观变。
3. 无后端/契约/迁移 diff;views 源零改;无新依赖;`diff --stat` 仅本卡文件。

## 取用旧 skin 文件
```bat
git checkout feat/T-V33-web-skin -- packages/web/src/workbench/object-node.tsx packages/web/src/tokens.css
:: object-node.tsx 再按红线① 改用 PortHandles/portHandleId 对齐端口
:: styles.css 的 .object-node* 块从旧 skin 手工挑出来追加(git show feat/T-V33-web-skin:packages/web/src/styles.css)
```

## 跟进(本卡不做)
ruleStatus/provenance/维度叠加接 view-API(待 P3 + 人发起契约)、暗色细调、动效、WCAG AA 对比校验。
