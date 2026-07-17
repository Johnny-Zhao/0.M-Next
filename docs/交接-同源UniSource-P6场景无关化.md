# 交接文档 · 同源 UniSource(截至 T-PC04 审毕)

> 用途:新开对话时把本文件贴进去或让 Claude 读它,无缝接续。日期锚:2026-07-17。

## 一句话

开发 **同源 UniSource 前端**(统一数据驱动办公平台里的**视图引擎组/多视图工作空间插件**),方式=**迭代出任务卡 → Codex 实现 → 我逐张代码级审查 → 出下一张**。当前正处 **P6「场景无关化」**(让同源从"写死门锁一个场景"变成"连任何工作空间都能用")。

## 平台与同源定位(V3.3 说明书)

- 平台=**小内核 + 多引擎 + 插件化**;6 层架构、9 个一级功能域、11 步数据为中心流程。
- **同源 = 一级功能域#3「多视图工作空间」+ 6.4.1 选中联动 = 视图引擎组**。红线 10.7:**不得复制主数据事实**——同源只做"从内核数据渲染多视图",事实源在内核。
- **门锁/装机**只是同源要装的**其中一个场景**,不是全部。

## 架构关键概念

- **UnisourceGateway 接口**:`MockUnisourceGateway`(自带 Store,纯前端演示)/ `KernelGateway`(ViewClient+CommandClient,连真内核,唯一可 import `@m-next/views` 的白名单处 + dto-mappers)。
- **module-level singleton stores**(workspace/changeSet/validation/outputs/annotations/structuredImport)经 `useSyncExternalStore` 绑定。
- **mode-aware 模式**(P4/P5 全卡通用):每 store 有 `setKernelSource(src|null)`;async 方法 fire-and-forget(setActor→command→refresh→toast;catch→toast 不 throw);`boot.tsx` 按 null(mock)/gateway(kernel)/null(fallback)接线。
- **016 写桥**:乐观本地写 + 后台内核命令 + 回滚 + toast;按对象 FIFO 串行;temp→kernel id 归一;对象版本乐观锁(G8)。

## 两条卡序轨道(关键!)

1. **T-US-* 轨(我起草的主线)**:016→022 全部完成合并;走 **A1(自动/置空)**思路。
   - P4:016(写)/017a(校验接内核)/017b(AI 变更集)/017c(空间角色)/018(输出)/019(打磨)。
   - G 卡:G2 changeState / G3 updateRelation / G4 slot_binding(views 客户端补缺)。
   - P5:020(评审批注)/021(结构化导入)/022(血缘)。
   - **BE1**(后端特批):给后端补**门锁 profile**(`packages/domains/hardware-products/profile.manifest.json` + `DevSeedRunner` 加 `HARDWARE_WORKSPACE=4444…`),门锁对象仍由前端 `seedDemoData` 播种。已合并、**门锁 11 步端到端全通**。
   - **T-US-023(P6批1 解耦 shell)**:我起草了,但**已作废**——见下。

2. **T-PC-* 轨(用户另一条并行线,采购场景)**:走 **A3(配置驱动 preset)**,用"第二个真实场景 PC 采购"逼出通用化。分支 `feat/T-PC02-pc-procurement-profile-seed`。
   - T-PC02=PC 采购后端 profile+seed(改 `DevSeedRunner.java`,跟 BE1 一个路子)。
   - **T-PC04(刚审完,通过)**=统一 Expression/View 解析 + 通用化所有表达(doc/canvas/matrix/bi/ana)。

## T-PC04 审查结论:**通过**(架构比我 T-US-023 高明)

- `presentation/expression-runtime.ts`:通用解析器 `exprId+form → Expression → View`,校验归属/类型,返回明确 `expressionMissing/viewMissing/kindMismatch`,不猜页面。
- `presentation/presentation-preset-registry.ts`:按 `templateCode` 取 preset——`hardware_products`(门锁,从种子+config)/`pc_procurement`/`unknown`(通用 grid 兜底)。**门锁精致面靠 preset 保住**。
- `data/kernel-gateway.ts:148` `loadWorkspace`:**事实取内核**(objects/relations/types/history)**+ 表达取 preset 经 bindings remap 到内核对象**。红线 10.7 架构正确。`remapSeedPresentation` 泛化成"remap 任意 preset";`seedDemoData` 加 `templateCode==="hardware_products"` 守卫。
- `presentation/pc-procurement-preset.ts`:**真·第二场景**(装机方案,config+bindings 表达,零组件改动就能跑)——场景无关的硬证。
- `matrix/matrix-view-model.ts`:`parseMatrixConfig` 从 `view.config` 读维度、按内核 objectType.fields 解析、字段缺失返回明确 unavailable。通用组件全域 grep **无门锁残留**;`@m-next/views` 仍只在白名单。

**3 个待用户在本机核实(我从沙箱没法验)**:
1. **`corepack pnpm verify:web` 是否真绿**——沙箱跑不了;Linux 挂载 git 状态陈旧失真(diff 显示 5693 删/66 增、漏掉新 presentation/ 文件),报告的"566 测试通过"只能采信。
2. **分支非纯前端**:`DevSeedRunner.java`+其测试改过=**T-PC02 后端 PC 采购 seed(预期,非 T-PC04 违规)**,但确认捆在一起是你要的。
3. 只抽查了核心+matrix,未逐行看全 ~45 文件。

**2 个非阻断小疵**:`matrix columnTone` 还按"研发中/预售/停产"字符串配色(装饰兜底,无碍);`memberAvatar` 用 `find(id==="ai")!` 非空断言,无 ai 成员会抛,建议兜底。

## 为什么 T-US-023 作废

我那张走 A1(backend 把门锁表达层置空 + 自动生成)。T-PC04 走 A3(配置驱动 preset:门锁 polish 保留 + PC 场景 + unknown 通用兜底),**更完整**,已把 P6「通用渲染」做掉。故 T-US-023 不再推。

## 下一步(二选一,等用户定)

- **A**:接着起草 **T-PC05**——真·通用 GRID(吃 preset 的列/排序/筛选,替换当前 `sourceFallback` 到数据源列表的临时降级)。这是 T-PC04 报告明确留的手尾。
- **B**:用户先本机 `verify:web` + 手工连室内(`1111…`)/PC 两个空间确认场景无关,再决定。

## 关键教训(务必记住)

- **stale-mount**:`/sessions/…/mnt/` 上的 bash grep/sed/wc/git-diff 对**新改文件不可靠**(本对话又中招:git diff 显示假的巨量删除)。**Read 工具(Windows `E:\` 路径)才是权威**。审查断定"有缺陷"前,一律先用 Read 复核。
- 出卡格式:封闭文件清单 + 逐条可测行为 + 验收标准 + 禁止事项 + "完成后停止等审查"。
- `AskUserQuestion` 用结构化 `questions` 数组,选项别塞中文引号/裸引号,避免 JSON 解析错。

## 路由速查

`/us/source/{typeCode}` 网格 · `/us/expr/{exprId}?form=grid|doc|canvas|matrix|bi|ana` · `?drawer=chat|review|lineage` · `/us/source/validate` 校验 · `/us/settings/access` 审批 · `/us/preview` 内核联调 DEV。backend:`?backend=1&ws=<UUID>`。工作空间 UUID:门锁 `4444…`、室内 `1111…`、技术 `2222…`、MBSE `3333…`。
