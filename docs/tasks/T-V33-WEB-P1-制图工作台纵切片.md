# T-V33-WEB-P1 — 前端 P1:可停靠制图工作台 · 最小可操作纵切片

蓝本:`docs/北极星-制图工作台-定稿.md` + `docs/选型-图引擎与可停靠布局.md`。**packages/web 域,纯前端**(无后端/契约/迁移改动)。**取代作废的 `T-V33-WEB-1 五镜头壳视觉重构`**(定位已转为可停靠制图工作台)。

定位:用 **dockview + React Flow** 搭"可停靠工作台外壳 + 一个可编辑 2D 图面板",端到端证明产品核心回路:**节点 = 对象、画 = 发命令、改即重算**。最小但真能操作。

**新依赖(AG-502 需登记)**:`dockview`(MIT)、`@xyflow/react`(React Flow,MIT)。本卡不引 three.js / mermaid(留 P2)。**自主可控措施(vendor 进私有仓 / 离线构建)记为跟进备忘,本卡先走通;但 package.json 锁定具体版本号(精确版本,非 `^` 浮动)。**

## 范围

### A. 可停靠外壳(dockview)
- 用 dockview 搭工作台容器,至少 **3 个面板**:`「图」`(React Flow)、`「模型树」`、`「属性/校验」`;面板可拖动 / 停靠 / 浮动(用 dockview 默认能力即可)。
- 顶栏复用现有(工作空间切换 + sync 徽标);布局可后续存预设(本卡不做)。

### B. 可编辑 2D 图面板(React Flow)—— 核心
- **读**:用现有 `ViewClient` 取某 workspace 的对象与关系(`objects` + `relations`/`tree`),渲染为 React Flow **节点(node = 对象**,显示 类型/名称 + 一个派生值 fx + 规则态如视图可得)与 **边(edge = 关系)**。
- **写(经命令,"改即重算"命门)**:**至少一条写回路端到端**——
  - 在节点/属性面板**编辑一个驱动字段** → `CommandClient` 改字段命令 → **重取视图** → 该对象**派生值随之更新**(改即重算);
  - 尽量再做:拖建节点 → createObject 命令;连线 → 建关系命令(若超时则作跟进,不强求,但"改字段即重算"必须通)。
- **选择联动**:选中节点 → 属性/校验面板显示该对象详情。

### C. 模型树 / 属性面板
- 模型树:复用 `ViewClient.tree` 渲染层级,选中跨面板联动(可复用现有 `SelectionCoordinator`)。
- 属性/校验:选中对象的字段(**存储 vs 派生 fx 区分**)+ 规则态(视图可得则显示;**不可得则 TODO 标注,不编造**)。可复用现有 `DetailPanel` 或新写薄面板。

## 封闭文件清单
**修改**
- `packages/web/src/app.tsx`(改为 dockview 工作台容器入口;保留 ViewClient/CommandClient/SelectionCoordinator/sync 接线)
- `packages/web/package.json`(加 `dockview`、`@xyflow/react`,**锁精确版本**)
- `packages/web/src/styles.css`(工作台 + 面板 + 节点最简样式;视觉换肤待 Design 令牌,本卡先朴素可用)

**新增**
- `packages/web/src/workbench/Workbench.tsx`(dockview 容器 + 面板注册)
- `packages/web/src/workbench/DiagramPanel.tsx`(React Flow:对象→节点、关系→边、改字段→命令→重取)
- `packages/web/src/workbench/TreePanel.tsx`、`InspectorPanel.tsx`(可复用 DetailPanel)

**零碰**:`packages/views/**` 内部(可 `import` 复用 `ViewClient`/`CommandClient`/`DetailPanel`/`SelectionCoordinator`,但**不改其源**)、所有后端 `packages/{shared,kernel,engines,server}`、`contracts/**`、`db/migration/**`。

## 红线 / 门禁
- **写一律经 `CommandClient` 命令入口**(AG-110);视图/面板只读取;**不新增/改 view-API 契约、不碰后端/迁移**(AG-301/501)。
- **不编造**后端没有的派生/规则字段;缺的标 `TODO(view-API)`。
- **新依赖仅 `dockview` + `@xyflow/react`(均 MIT)**,不引其它;`package.json` 锁精确版本(自主可控备忘:后续 vendor/离线,本卡不做但不破坏可行性,不接外网运行时 CDN)。
- `corepack pnpm verify` 全绿(web vitest / lint / type-check);不降覆盖率门槛。
- AG-405 落盘自检;**分支 `feat/T-V33-web-p1` 提交不合并**;基线落后只 `git merge main` 拉平;完成发 `git diff --stat main` + `pnpm --filter @m-next/web test` 汇总。
- 若要做到效果**必须**改 `packages/views` 或新增 view-API 字段 → **停下回报,不夹带**。

## 验收
1. `corepack pnpm verify` 全绿;web 测试覆盖:工作台渲染 3 面板且可见、可隐藏/停靠;图面板由 mock `fetchFn` 渲染节点 + 边;选中节点 → 属性面板出详情。
2. **改即重算命门(端到端)**:在某对象改一个驱动字段 → 经命令 → 重取 → 该对象派生值更新(测试断言:改字段触发 `CommandClient` 改字段调用 + UI 重取;若派生在 `object.fields` 内,断言重取后值变)。
3. 行为:dockview 面板拖拽/浮动可用;**节点=对象、边=关系**映射正确;选择跨面板联动。
4. 无后端/契约/迁移 diff;`packages/views` 零源改;新依赖仅二者且锁精确版本。

## 跟进(本卡不做)
3D 面板(three.js)、文本面板(Mermaid)、图↔文本 AI 双向、维度信息视图叠加、一致性裂缝、比选评分台、命令面板 ⌘K、AI 守门人、**自主可控 vendoring/离线**、**视觉换肤**(待 `平台UI-图元与令牌-ClaudeDesign.md` 的令牌 + 图元规范)。
