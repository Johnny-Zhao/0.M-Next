# 交接文档 — 同源 UniSource 项目:会话上下文与推进指南

> 用途:AI 助手换新会话/新模型时的完整上下文。**新会话第一件事:通读本文档**,再按「七、下一步」推进。
> 更新时点:T-US-015 审查通过(待用户合并)、T-US-G1 后端卡已开出(待发 Codex)、T-US-016 待出卡。

## 一、项目是什么

**同源 UniSource** = 统一数据源文档生成工具的全新前端(14 屏设计稿完整还原),位于 monorepo `E:\Web\Personal\0.M-Next` 的 `packages/web/src/unisource/`,挂 `/us/*` 路由(`main.tsx` 分流,与旧工作台 workbench 共存)。核心叙事:**一份数据,多种「说法」**(表格/文档/画布/模板/仿真/矩阵/BI/分析都是同一数据源的描述形式),字段引用 live 同步、AI 写入走变更集确认、双轨版本(data 轨=字段/view 轨=布局)、权限与审批、校验阻断分享。

- 设计稿(只读真理源):`docs/design/design-new/project/` 下「同源 主版本页面集.dc.html」(14 屏)+「设计系统 Design System.dc.html」+「交接规格 Handoff Spec.dc.html」。归档稿「同源 UniSource 关键屏.dc.html」**不得参考**。
- 演示剧本时间线(所有 Mock 数据必须遵守):09:12 基线 S3 ¥1,299 → 10:18 AI 解析供应商邮件(改2/增1/待确认1,上市日期置信 74%)→ 10:24 王芸确认 ¥1,199 同步 3 文档 → AI 对话改续航 12→14 + 加「活跃渠道数」KPI → 10:32 XSRC-001 缓存价 ¥1,299 ≠ 权威 ¥1,199。成员:王芸(admin)/李晓(研发)/陈默(渠道运营,数据只读+表达可编辑→越权转审批)/周然(法务,纯只读)/同源 AI(随发起人权限)。

## 二、协作流程(铁律,勿改)

1. **AI 写任务卡** → `docs/tasks/T-US-0XX-*.md`。卡的固定结构:状态行/PR 要求(Spec-Ref 引用设计稿+规格章节+前卡审查结论)/**背景与关键决策(必读,讲清前因后果和为什么)**/目标/**涉及文件(封闭清单)**/行为要求(逐条可测)/测试要求(vitest 共置,纯逻辑优先)/验收标准(机器可判+视觉+手工)/**禁止事项**(含范围外功能、治理红线),末尾「完成后停止等待审查」。
2. **用户把卡发给 Codex** 实现。
3. **AI 逐卡代码级审查**:bash `ls` 看结构 + Read/Grep 核验内容(见「六、环境注意」),输出「## T-US-0XX 审查结论:通过/不通过」+ 对卡核验表格 + 偏差记录(nit 折入下一卡「顺手修」)+ 合并前手工链提示。
4. **用户本机验证**:`corepack pnpm verify:web`(唯一权威门禁,含 lint/typecheck/test/build/architecture:check/tokens:check/prettier)+ 手工走查 + Windows `git status` 干净 → 合并。
5. 回到 1。用户口头触发词:「出卡」「审查」「已合并,继续出卡」。

## 三、已完成里程碑(全部已合入 main,除非注明)

- **P0**(AI 直接实现):骨架/路由/`us-tokens.css` 全量 token/8 个 primitives/壳(Header/Sidebar/Inspector/布局/响应式)/preview 页/`scripts/check-us-tokens.mjs` 门禁(已入 verify:web)。
- **P1**(T-US-001~006,剧本主线 8 屏):001 内核形状数据模型+seed+store;002 底座补丁+首页 8a;003 表格 1a+分屏 1c;004 文档 1b+引用体系(RefChip 五态);005 AI 导入 6a+AI 对话 6b;006 校验 9c(11 条规则引擎)+权限 8b+端到端(`docs/验收-同源P1剧本走查.md`)。
- **T-US-007** 视觉打磨(对比度 token 上调/emoji 换 SVG/FormTag 金图标;`docs/走查记录-T-US-007视觉打磨.md`)。
- **P2**(T-US-008~012):008 视图画布 7a(React Flow 复用、updateViewConfig+inverseView 双轨恢复、deleteObject 删除闭环、align fork);009 模板 8c(hardware_products 装机域、Expression.space main/workshop、SlotBinding 对象绑定+TPL 规则迁移、点击+拖拽实例化、生成配置单阻断管线);010 仿真 9b(时序纯派生自 relation.protocol 查表、回放引擎组件局部态零业务写入、弱网 ×1.5);011 矩阵 2b(owner 字段、拖卡走 requestWrite 三分支:直写/转审批/禁拖)+分析 9a(AnaReport seed+钉到看板=setKpiVisible+inverseKpi 撤销);012 插件 5b(PluginDef 注册表 6 条、setPluginState 不进业务双轨、AddFormMenu 联动)+清尾(拖拽添加节点/ShareDialog 简版/customers 脱敏「···」/配置单 RefChip/canDragCards 迁 session-store/preview P2 区)+`docs/验收-同源P2走查.md`(14 步)。
- **T-US-013** P2 视觉打磨(插件「启用」按钮分支修复/SlotCard preview/RF 水印隐藏/等宽字体/reduced-motion 全查)。
- **E.3 预研**(AI 直接产出):`docs/预研-E3-同源Mock到内核契约对接.md` —— **读它,它是 P4 的宪法**。结论:~70% 直映;缺口 G1~G10;Gateway 双实现方案;P4 五批计划。用户已拍板:① AG-101 白名单同意(仅 `data/kernel-gateway.ts`+`data/dto-mappers.ts` 可 import `@m-next/views`);② **G1 推后端小卡、G2 前端投影**;③ P4 按五批跑。
- **P4 已走两批**:
  - **T-US-014**(已合入):`unisource/data/` 六文件——`gateway.ts`(UnisourceGateway 18 方法 async 接口,每方法 JSDoc @kernel/@mock/@gap 三行注记;`confirmAiChange(setId, itemIds?)` 为 G1 预留)/`mock-gateway.ts`(自持 WorkspaceStore+ChangeSetStore 委托,`toDemoSeed` 显式组装)/`dto-mappers.ts`(ViewObject/ObjectType/HistoryEntry/CheckResult 四映射器,type-only import)/`import-boundary.test.ts`(白名单守护,含 type-only 强制与 workbench 禁令)。
  - **T-US-015**(审查通过,**待用户合并**):`kernel-gateway.ts`(读装:objectTypes→逐类型分页 objects→逐对象详情收关系去重→逐对象 history 合并;`seedDemoData` 业务键幂等种子;写面全部 throw "T-US-016")/`identity-remap.ts`(业务键=objectTypeCode+name,重写表达层引用,未命中转 dangling+装载报告)/`boot-mode.ts`(`?backend=1&ws=` 优先,localStorage `ui.us.backend`/`ui.us.workspaceId` 兜底)/boot.tsx 分岔(加载屏/错误面板/回退 Mock)/顶栏 KERNEL ribbon「写入本地」/demo-reset backend 分支=重载/preview 页「内核联调 DEV」区(种子按钮+报告)。014 三修已落(@gap 措辞/AI 端点注记 ai-commands/toDemoSeed)。
  - **T-US-G1 后端卡**(已开出 `docs/tasks/T-US-G1-后端-AI变更集条目级确认.md`,**待发 Codex**,与 016 并行,017 前必须合入):ConfirmAiChange 加可选 `itemIds[]`;缺省=现行为;部分确认后集合保持 PROPOSED 可续确认,全终态转 CONFIRMED;新错误码 AI-422-ITEM-NOT-IN-SET/AI-422-EMPTY-ITEM-SELECTION;幂等复用现有项级键 `aiconfirm:{setId}:item:{seq}`;改动面=contracts 契约文档+schema(特批)+server 三个 Java 文件+E2E 测试+views command-client 可选参数。

## 四、真实契约要点(P4 施工必备)

- **ViewClient**(`packages/views/src/api/view-client.ts`):objects 分页(≤200)/object 详情+关系/objectHistory(kind/before/after/actor/seq)/ruleStatus(BLOCK|WARN|OK)/runRuleCheck→checkResults(runId)/snapshots/outputs/aiChanges/annotations/objectTypes(id UUID+code)/relationTypes/simRuns/simSeries/matrix(关系矩阵,≠2b 的枚举分组)/lineage/exchange。
- **CommandClient**:命令信封 `{commandType, workspaceId, correlationId, idempotencyKey, payload}` + `X-Actor-Id`;UpdateFields(**expectedObjectVersion+可选 expectedFieldVersion 双乐观锁**)/CreateObject(objectTypeId **UUID**,可带 initialState DRAFT|PENDING_CONFIRM)/Archive(VOID+relationPolicy:"unlink")/CreateRelation/UpdateRelation/Unlink/ChangeState(状态机 DRAFT→PENDING_CONFIRM→CONFIRMED→…→FILED)/AI 三命令(`/ai-commands`,Confirm 需 REVIEWER+)/评审批注三命令/RBAC(空间级 VIEWER<AUTHOR<REVIEWER<ADMIN)。错误:KERNEL-409-VERSION-CONFLICT(带 conflictingFields)/423-LOCKED/422-INVALID/PERM-403-FIELD-DENIED,封装为 CommandFailure。
- **缺口速查**(详见预研 §三):G1 条目级确认(后端卡进行中)/G2 资源级权限+脱敏(前端投影:王芸 ADMIN/李晓 AUTHOR/陈默 AUTHOR/周然 VIEWER,脱敏演示级)/G4 仿真保持前端派生/G5 槽位绑定→未来 slot_binding RelationType/G6 视图配置前端职责/G7 表达文档层前端职责/G8 字段级 updatedBy 降级对象级/G9 校验忽略→annotation 承载/G10 无 Undo 命令=history 反向值+新写入。

## 五、治理红线(每张卡的禁止事项都要重申)

1. 只动 `packages/web/src/unisource/**`(+卡列明的 docs;G1 卡例外:server/contracts/views 特批)。contracts//architecture//AGENTS.md/scripts 平时不可触碰。
2. 零新增 npm 依赖(React Flow `@xyflow/react` 复用不算)。
3. import 边界:仅 `data/kernel-gateway.ts`(运行时)与 `data/dto-mappers.ts`(type-only)可 import `@m-next/views`;禁 import workbench(要复用就复制,如 align.ts);守护=`data/import-boundary.test.ts`。
4. AG-102:localStorage 仅 `ui.` 前缀 UI 偏好(现有:`ui.us.backend`/`ui.us.workspaceId`);业务数据零落盘。AG-209:选择联动零写入。AG-106/204:AI 写入必须走 ChangeSet 确认流。
5. tokens 门禁:`scripts/check-us-tokens.mjs`,us-tokens.css 之外禁散写色值/字体名。
6. CSS 随组件同 commit;历卡 CSS 段只追加不重排(打磨卡特例除外);每步一 commit。
7. store 公开 API 保持同步(async 化是 016 的显式课题,不许悄悄改)。
8. 卡必须有封闭文件清单;实现中发现必须超出清单 → 停下来 PR 说明等审查。

## 六、环境注意(AI 侧沙箱怪癖,新会话必读)

1. **不要在沙箱跑 git**(幻影冲突/index.lock);git 状态以用户 Windows 本机为准。
2. **验证以用户本机 `corepack pnpm verify:web` 为唯一权威**;沙箱 pnpm 走代理会挂,别试图在沙箱装依赖跑测试。
3. 审查方法:bash `ls`(mnt 路径 `/sessions/<session>/mnt/0.M-Next/...`)看目录结构;**文件内容一律用 Read/Grep 工具**(Windows 侧准确);mount 对新改文件可能陈旧,以 Read/Grep 为准。
4. 设计稿是编译后 HTML,提取文本用 bash python3(html.unescape+去标签)。
5. 手工联调后端:`node scripts/dev-up.mjs` 起服;工作台首页「新建项目」建空间;server 测试 `node scripts/run-maven.mjs test`。

## 七、下一步(按序,勿失方向)

1. **等用户合并 015**(合并前手工链:Mock 零回归 + dev-up→建空间→preview 种数据→`?backend=1&ws=`→工作台改价→同源重载见新值→断后端看回退)。**T-US-G1 卡可立即发 Codex**(与 016 并行);G1 交付审查要点:缺省路径逐位兼容/部分确认状态机/两个新错误码/幂等复用项级键/契约文档与 schema 同步/views 客户端两分支断言。
2. **出 T-US-016(P4 批3:写路径)**——出卡前必须先做的设计决策(上一会话已明确的方向):
   - **写路径 async 桥接策略**:UI store 是同步的,KernelGateway 写是 async。方案倾向:**乐观本地先写(现 Mock 逻辑照跑)+ 后台发内核命令 + 失败回滚并 Toast**;或写时 pending 态。出卡时二选一并写清理由,这是 016 最大的设计题。
   - KernelGateway 写面实装:UpdateFields(乐观锁,expectedObjectVersion 从本地 version 取)/CreateObject(code→kernelId 经 objectTypes 缓存;陈默审批链改走 initialState PENDING_CONFIRM+ChangeState)/CreateRelation/Archive(deleteObject)/undoByEvent(G10:读 history 反向值再 UpdateFields,每次重读版本)。
   - **actor 接 session**:015 里 KernelGateway actor 硬编码 "wangyun",016 必须随 RoleSwitcher 切换(CommandClient.setActorId)。
   - **乐观锁冲突 UI**:CommandFailure(409 conflictingFields)→ 冲突 Toast/提示(参考 workbench conflict 体验,**复制不 import**)。
   - 涉及既有文件会比 014/015 多(store 写方法接 gateway),封闭清单要精确;Mock 模式必须零回归。
3. **016 合并后出 T-US-017(批4)**:校验(runRuleCheck/checkResults/ruleStatus 接 9c 与分享阻断)+ AI 变更集(aiChanges+Confirm(itemIds)/Reject 接 6a/6b;**依赖 G1 已合入**,未合则降级全量确认+PR 声明)+ 审批(PENDING_CONFIRM+ChangeState 接 8b;G2 前端投影:四人→ADMIN/AUTHOR/AUTHOR/VIEWER)。
4. **017 后出 T-US-018(批5,P4 收官)**:快照/输出接 snapshots+outputs(导出闭环)+ 槽位绑定关系化(G5:slot_binding RelationType)+ P4 端到端走查文档。
5. P4 完成后的开放方向(与用户商量):真实文件解析/协同 presence/插件真实挂载/G2 资源级 RBAC 立项/性能(虚拟化阈值)。

## 八、关键文件索引

- 计划与预研:`docs/前端实施计划-同源主版本页面集.md`(A–J)/`docs/预研-E3-同源Mock到内核契约对接.md`
- 任务卡:`docs/tasks/T-US-001…015 + T-US-G1`(每张卡都是决策记录,写新卡前先读上一张的审查结论段)
- 走查:`docs/验收-同源P1剧本走查.md`/`docs/验收-同源P2走查.md`/`docs/走查记录-T-US-007视觉打磨.md`/`docs/走查记录-T-US-013-P2视觉打磨.md`
- 代码:`packages/web/src/unisource/`(model/seed/state/validation/data + 各形式目录 grid/doc/split/import/chat/bi/access/canvas/template/sim/matrix/ana/plugins + shell/pages/primitives)
- 契约:`packages/views/src/api/view-client.ts`+`command-client.ts`/`contracts/*.md`+`schemas/*.json`
- 门禁:根 `package.json` verify:web/`scripts/check-us-tokens.mjs`/`data/import-boundary.test.ts`
