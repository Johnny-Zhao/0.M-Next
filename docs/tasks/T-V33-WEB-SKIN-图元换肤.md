# T-V33-WEB-SKIN — 换肤:Fluent 令牌 + 图元/连线视觉落到 React Flow + dockview

蓝本:Design 产出(`bs-glyph.html` / 图元风格概念)+ `平台UI-图元与令牌-ClaudeDesign.md`。**packages/web 域,纯前端、纯表现层**。
前置:P1;**建议 P2a–P2d 全部合入 main 之后再做**——本卡重排 `diagram-panel.tsx` 节点渲染与 `styles.css`,串在 P2 之后,避免和 P2 大面积撞。

定位:把朴素的 P1/P2 换成 Design 的 Fluent 卖相——设计令牌 + 图元自定义节点(四类型 × 全状态)+ 连线视觉 + dockview 主题。**只换渲染与样式,不改取数/命令/选择逻辑。**

## 范围
- **A. 设计令牌**:新增 `tokens.css`,Fluent 调色板 → CSS 变量(强调/中性灰阶/语义四态/字体/圆角),亮暗双主题。取值据 Design:品牌 `#5B5FC7`、信息 `#0F6CBD`、达标绿 `#0E700E`、阻断红 `#B10E1C`、告警 `#835B00`、墨/灰 `#242424/#616161/#8A8886`、面 `#FAFAF9/#F3F2F1`。用变量,不散落写死。
- **B. 图元自定义节点**:新增 `object-node.tsx`,注册 React Flow `nodeTypes`。渲染"带类型对象":类型色条/图标 + 代号(mono)+ 名称 + 1–2 字段 + **fx 派生芯片** + **规则灯 BLOCK/WARN/OK** + **provenance 护照小标** + 端口。**全状态**:默认/悬停/选中/recomputing/blocked/stale/否决。四类型(分系统/组件/接口/需求)外观。数据取自现有 `node.data`,**不新增取数**;缺的字段(规则态)沿用 P1 的 `TODO(view-API)`,不编造。
- **C. 连线视觉**:把 Design 连线规范(类型/方向/状态/正交·曲线/标签)作为样式**套到 P2c 的 edge 组件**;若 P2c 已落,只补样式、**不重写结构**。
- **D. dockview 主题**:面板标题栏/标签/停靠提示套 Fluent 令牌。

## 封闭文件清单
**修改**:`packages/web/src/workbench/diagram-panel.tsx`(注册 `nodeTypes`,改用 `object-node`)、`styles.css`、`workbench.tsx`(dockview 主题类);若 P2c 已合则 `edges.tsx`(只补样式)
**新增**:`packages/web/src/workbench/object-node.tsx`、`tokens.css`、`object-node.test.tsx`
**零碰**:`packages/views/**` 源、后端、契约、迁移。

## 红线 / 门禁
- **纯表现层**:不改取数/命令/选择/改即重算逻辑,只换渲染与样式。
- **不新增依赖**(无图标字体——用内联 SVG / CSS);不编造字段(规则态缺 → TODO)。
- 不碰 views 源/契约/迁移;`corepack pnpm verify` 全绿;不降覆盖率。
- 分支 `feat/T-V33-web-skin` 提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + `pnpm --filter @m-next/web test` 汇总。

## 验收
1. verify 全绿;测试:图元节点各状态渲染(blocked 红边 / stale 琥珀 / 否决灰+删除线 / fx 芯片 / 规则灯三态)、四类型外观、亮暗主题切换。
2. 行为不回归:选择联动、改即重算、连线建删一切照旧(只外观变)。
3. 无后端/契约/迁移 diff;views 源零改;无新依赖。

## 分支与合并操作(Windows cmd,P2 全合入后再做)
```bat
cd /d E:\0.M-Next && git checkout main
git worktree add E:\mnext-skin -b feat/T-V33-web-skin
cd /d E:\mnext-skin && corepack pnpm install
:: 发 Codex 按本卡实现;完工要求:verify 绿 → git add -A && git commit → git log --oneline -1 看到 feat 提交
:: 合(确认 P2a-d 已在 main 后):
cd /d E:\mnext-skin && git merge main
::   diagram-panel.tsx / styles.css 冲突 → 保留双方(P2 的交互 + 本卡的样式)→ git add . && git commit
cd /d E:\mnext-skin && corepack pnpm install && corepack pnpm verify
cd /d E:\0.M-Next && git merge --no-ff feat/T-V33-web-skin && corepack pnpm verify
git worktree remove E:\mnext-skin && git branch -d feat/T-V33-web-skin
```

## 跟进(本卡不做)
暗色细调、可访问性对比 WCAG AA 校验、节点/连线动效、维度叠加配色(随 P3c)。
