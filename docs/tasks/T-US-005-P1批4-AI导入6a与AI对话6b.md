# 任务卡 T-US-005 — 同源 P1 批4:AI 导入 6a + AI 对话 6b(含最小 BI 看板宿主)

- 状态:**可下发**(纯前端、零新依赖、全 Mock/脚本化 AI、不触后端)
- PR 要求:`Spec-Ref: docs/design/design-new/project/同源 主版本页面集.dc.html(6a/6b 屏)、设计系统 §02(AI 指令条/Toast·操作卡/徽标)、交接规格 §02(AiPromptBar/ImportSteps+SemanticMatchChips+TargetDiffList/ChatDrawer+ActionCard/KpiCard 族)/§05(AI 导入/AI 对话状态)/§06(解析/逐项审核/确认写入/聊天发送/撤销全部)/§07(AI 解析·对话=按剧本脚本化)、docs/tasks/T-US-004(审查结论)` + 自检输出段
- 序列位置:P1 五卡之 **批4**;006(校验+权限+剧本端到端)依赖本卡的 AI 写入链路

## 背景与关键决策(必读)

T-US-004 已合入:DocModel/RefChip 五态/@插入(view 轨事件)/DataPanel。本卡补上剧本的 AI 半边:**AI 的一切写操作必须以 ChangeSet(source='ai')呈现、可逐项审核、可撤销**(AG-106/204 语义,交接规格 DEV NOTES 末条)。AI 响应全部脚本化(交接规格 §07),不接任何真实模型。

**决策 1:seed 时间线与 6a 的自洽。** 设计稿 6a 是 10:18–10:24 之间的定格,而 seed=剧本终态。做法:`changeset-ai-quote` 重构为「部分已确认」——`ai-price`(96%)与新增 `ai-contract`(createObject,89%)标记 `applied:true, confirmed:true`(对应 10:24 王芸已确认写入);`ai-launch`(74%,needsConfirm)保持未确认 → 整单仍 pending。这样 6a 能同时展示「已写入 ✓」「待确认」两种行,首页 TodoBanner=1 项待确认不变,preview 演示按钮仍可用。**注意保持既有断言**:seed test 的 74%/needsConfirm、home-vm 的 pendingCount=2/pendingAiCount=1、changeset 部分接受测试(其用例 acceptItems('ai-price') 需随 applied 初值调整,逐条在 commit message 说明)。
**决策 2:6b 宿主 = 最小 BI 看板。** 6b 设计的中栏是渠道经营看板(form=bi)。本卡实现最小 BI:KPI 卡×4 + 柱图卡(纯 CSS 条),数据入 seed;「活跃渠道数」卡由 AI 对话剧本新增(琥珀描边+AiBadge)。完整 BI/分析页(9a)仍属 P2。
**决策 3:ChangeItem 增 op:'skip' 不做**——「跳过 防护等级(与现值一致)」由 VM 派生:item.nextValue === 当前权威值 → 渲染「跳过」DiffBadge 且不参与写入统计。模型零改动。

T-US-004 审查 3 个 nit(顺手修):
1. `FieldRef` 增 `confidence?: number`,seed 给 74% 那条赋值;doc-view-model/DataPanel 的置信标改读 `ref.confidence`(去掉写死 "74%");
2. `addFieldRef/rebindFieldRef` 增 `actor: MemberId` 参数,view 轨事件与活动流署名用它;doc-view 调用处传 `session.currentMemberId`;
3. `UsMonoTag` 新增 `tone="danger"` 变体(追加 `.us-monotag--danger` 样式,不改既有),DataPanel「悬空」徽标改用之。

## 目标

`/us/import` 按 6a 屏完整还原(4 步进度器/原文实体高亮/语义匹配 chips/差异树/置信门控/确认写入走 changeset);任意表达页 `?drawer=chat` 打开 6b 对话栏(脚本化对话产生 ActionCard,改数走 AI changeset 即时应用可撤销,越权转审批);渠道经营看板 form=bi 最小宿主(KPI+柱图,支撑「AI 加卡」剧本)。

## 涉及文件(封闭清单)

**A. 底座扩展**

- `model/kernel.ts` — 不改实体形状(决策 3);`model/view-layer.ts` — `FieldRef.confidence?`(nit 1);`KpiCardDef { id,label,value,delta,deltaSign,sourceLabel,aiAdded?,visible }`、`BiBarDef { label,value,percent,tone:'high'|'mid'|'low' }`、`ChatMessage { id,role:'user'|'ai',text,actionCardIds? }`。
- `seed/demo-seed.ts` — ① changeset-ai-quote 按决策 1 重构(+`ai-contract`:createObject 合同台账「华东智联 · S3 报价」fields 渠道=华东经销/报价=1199/联系人=`老李 138****8000`,applied:true;**同时从 seed 合同台账对象里移除对应静态记录**,由 applied 项落库逻辑不重放——seed 终态记录数与首页文案「今日 增 1(AI 导入)」保持一致的口径:合同台账仍含该记录(10:24 已写入的终态),`applied:true` 项仅作展示不再重放写入);② `kpis`(本月 GMV ¥2.4M +12.4%/S3 预售订单 8,214 +38.2%/平均客单价 ¥876 -2.1%/活跃渠道数 42 +3·aiAdded·visible:true(终态))与 `biBars`(线上直营 6,420 high/京东 4,180 mid/天猫 3,960 mid/线下经销 2,850 low/运营商 1,240 low);③ 6a 原文邮件文本 + 实体高亮区间(`rawImport { text, spans:[{start,end,tone:'primary'|'change'}] }`)+ 语义匹配 chips 数据(意图 95/主体 92/来源 88);④ 最近导入列表 2 条。
- `state/workspace-store.ts` — `createObject(objectTypeCode, fields, meta)`(对象+data 轨事件 inverse:null+活动流;6b/审批复用);`setKpiVisible(kpiId, visible, actor)`(view 轨事件+表达轨活动流;「撤销全部」用);nit 2 的 actor 参数化。
- `state/changeset-store.ts` — `applyItem` 支持 `op:'createObject'`(经 workspace-store.createObject);**applied:true 的 seed 项在任何 accept/confirm 中跳过重放**(已有 `item.applied` 判断,补测试覆盖 createObject 分支)。
- `state/chat-store.ts`(新,共置测试)— 消息列表 + `send(text, session)`:`matchScript(text)` 纯函数匹配剧本 → ① 剧本「续航+活跃渠道」:AI 回复文案 + 2 张 ActionCard——改卡(电池续航 12→14,经 `ChangeSet(source:'ai', actor=当前身份)` 提交并**立即 acceptItems 全部**(AI 跟随发起人权限:王芸直接落库;陈默/周然 → changeset 保持 pending,卡面显示「待管理员批准」),影响文案=受影响引用数;增卡(看板 + 活跃渠道数,`setKpiVisible(true)`,view 轨);② 剧本「客单价」:纯文字回复(拆解口径,无卡);③ 未匹配:提示支持的演示指令。`undoAll(messageId)`:逆序撤销该回复的全部操作(字段 undo + setKpiVisible(false)),ActionCard 置 undone;`typing` 态(定时器,fake timers 可测)。
- `primitives/badge.tsx` — `UsMonoTag` tone='danger'(nit 3)。

**B. AI 导入 6a(新目录 `import/`)**

- `import/import-view-model.ts`(纯函数,共置测试)— 由 pending AI changeset + workspace 派生:步骤态(4 步:输入=完成/语义匹配=完成/定位增删改=当前(有未确认)/写入=待办;全 applied → 写入=完成);差异树分组(按目标库/对象);每行 VM(DiffBadge op:增/改/跳过(决策 3 派生)/已写入 ✓;旧→新值 Mono;置信 % 色(≥80 绿 / <80 琥珀+「请确认」强调边);统计药丸 增N/改N/删0;「确认写入」可用性 = 所有 needsConfirm 项已逐项确认。
- `import/import-view.tsx` — 6a 布局:复用 WorkspaceLayout(DATA 侧栏;树上 增/改 DiffBadge 计数=pending 未 applied 项派生,写入后清零)+ 顶栏 4 步进度器(`import/import-steps.tsx`)+ 主体 `grid 1fr/1.2fr`;左卡 RAW(三页签:粘贴文本(active)/文件 xlsx·pdf·img(置灰 disabled)/AI 对话(跳转 drawer);正文 Mono 渲染 rawImport.spans 高亮;底部 AiPromptBar(墨 1.5px 描边+星标+「解析 Parse」墨底按钮));右卡解析结果(`import/semantic-chips.tsx` 三枚置信 chips;`import/target-diff-list.tsx` 差异树 + 每行「确认」勾选(仅 needsConfirm 项);底部操作条:统计 + 「逐项审核」(滚动至首个未确认项)+ 「✓ 确认写入」(绿实心,禁用带原因 tooltip))。
- 「解析 Parse」= 纯演出:点击 → 右卡骨架 800ms → 结果流入(不改数据,重复可放);「确认写入」= `acceptItems(未 applied 且已确认项)` → Toast「已写入 · N 处引用已同步 · 撤销」→ 左树徽标清零 → TodoBanner 消失(首页联动)。
- `pages/import-page.tsx` — 替换骨架为 ImportView。

**C. AI 对话 6b + 最小 BI(新目录 `chat/`、`bi/`)**

- `chat/chat-panel.tsx` — 表达页 `?drawer=chat` 时右侧**内嵌 360px 栏**(非 overlay,按 6b 三栏;1280 档 320):头(星标+「同源 AI」+Mono COPILOT+右「上下文:本表达 + 2 数据源」);消息列表(用户墨底右圆角 12/12/3/12,AI 白底描边 12/12/12/3);AI 回复内嵌 `chat/action-card.tsx`(改卡=琥珀底+方角「改」章+目标路径+旧→新 Mono+影响行;增卡=青绿底+「增」章;pending 态=琥珀边+「待王芸批准」);操作行「保留 / 撤销全部 / 查看 diff(占位 Toast)」;建议 chips(「按主机/配件拆分」「把柱图改成占比」→ 填入输入框);底部 AiPromptBar(占位「说点什么,改数据或改看板…」+ 纸飞机发送);typing 三点气泡。
- 顶栏 AI 入口:`shell/workspace-header.tsx` actions 槽前增可选 `aiHref`(星标图标按钮)——表达页/表格页传 `?drawer=chat` 切换;**仅加可选 prop,不改既有视觉**。
- `bi/bi-board.tsx` + `bi/kpi-card.tsx` + `bi/bar-chart.tsx` + `bi/bi-view-model.ts`(+test)— 渠道经营看板 form=bi:KPI 网格(visible 卡;aiAdded=琥珀 1.5px 描边+外发光+右上 AiBadge;数值 Mono 23px)+ 柱图卡「各渠道销量 · 本月」(CSS 条,tone→primary/bar-mid/bar-low;头部 Mono「渠道销量表」);`pages/expr-page.tsx` form=bi → BiBoard(exp-dashboard)。
- `us-components.css` — 追加 `.us-import-*`、`.us-steps-*`、`.us-chat-*`、`.us-actioncard-*`、`.us-bi-*`、`.us-monotag--danger`;**随组件同 commit**。

## 行为要求(逐条可测)

1. 6a 数字全派生:统计药丸/树徽标/步骤态与 changeset 实况一致;「跳过」行由值相等派生且不计入写入;applied 项显示「已写入 ✓」且确认写入不重放。
2. 置信门控:74% 项未勾选确认 → 「确认写入」禁用+原因;勾选后启用;写入 → 整单 resolved、TodoBanner 消失、左树徽标清零、Toast 可撤销(undo 该字段)。
3. 6b 剧本 ①(王芸):发送含「续航」「活跃渠道」句 → typing → AI 回复+改卡(12→14,文档引用 justSynced 联动、活动流 数据轨 viaAi)+增卡(看板出现第 4 卡,view 轨活动流);「撤销全部」→ 续航回 12(新写入版本前进)、KPI 卡隐藏、两卡置 undone。
4. 6b 越权(陈默):同句 → 改卡 pending 态「待王芸批准」,零落库;切回王芸在 8b 骨架页可见待办 +1(store 联动,UI 在 006)。
5. 6b 剧本 ②:「客单价」问句 → 纯文字回复;未匹配句 → 引导回复。均零写入。
6. BI 看板:form=bi 渲染 4 KPI+柱图;柱图 tone 与 seed 一致;undo 后仅 3 KPI。
7. drawer=chat URL 往返(开/关/刷新保持);1280 档宽 320。
8. nit 修复生效:置信标读 ref.confidence;@插入后活动流署名=当前身份(切陈默插入 → 署名陈默);悬空徽标砖红。

## 测试要求(vitest 共置,纯逻辑优先,fake timers)

import-view-model:步骤态派生(pending/全 applied 两态)、跳过行派生、统计药丸、确认写入可用性;chat-store:matchScript 三分支、send 王芸=落库+2 事件(data+view)、send 陈默=pending 零写入、undoAll 逆序恢复(值回 12、KPI 隐藏)、typing 定时;workspace-store:createObject 事件与活动流、setKpiVisible view 轨;changeset-store:createObject 应用分支、applied 项不重放;bi-view-model:visible/aiAdded 派生;既有测试回归(seed 重构影响的断言逐条注明)。

## 验收标准(机器可判 + 视觉)

1. `corepack pnpm verify:web` 全绿(本机权威);`node scripts/check-us-tokens.mjs` 0 违规;
2. 手工剧本:首页「去确认」→ 6a(74% 强调行)→ 勾选确认 → 确认写入 → Toast/横幅消失/树徽标清零;打开看板 `?drawer=chat` → 发续航句 → 两张卡 + 看板第 4 卡 + 文档页续航 chip 琥珀 → 撤销全部复原;切陈默重发 → pending 卡;
3. 视觉走查:1440×900 对照 6a(进度器/双卡/高亮原文/差异树/操作条)与 6b(三栏/气泡/操作卡/建议 chips/KPI 琥珀卡);
4. `git diff --stat main` 限封闭清单;每步一 commit;CSS 随组件同 commit。

## 禁止事项

禁止实现:真实 AI/流式输出、文件解析(页签置灰)、左树拖选改写入位置(仅文案)、查看 diff 真视图、评论/历史、校验中心与权限页 UI(006)、9a 分析页、KPI 拖拽/DropZone。禁止新增依赖;禁止 import `@m-next/views`;禁止整文件重排 CSS;禁止改 P0/002 CSS 段;primitives 仅允许本卡列明的 MonoTag danger 变体与 WorkspaceHeader 可选 prop;禁止 localStorage 业务数据(AG-102);选择联动零写入(AG-209);禁止触碰 unisource 之外的代码。完成后停止等待审查。
