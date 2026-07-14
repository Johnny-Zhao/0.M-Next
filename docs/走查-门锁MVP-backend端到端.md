# 走查 · 门锁 MVP 端到端(backend 真内核)

> 目的:在真内核(`?backend=1&ws=`)上把门锁场景的 11 步走一遍,验证平台说明书 11 章验收线——**"完成 MVP 端到端演示;核心数据不依赖手工复制"**。逐条打勾;走出来的缺口填最后一栏,回来按缺口出卡。
> 剧本时间线(预期值锚):09:12 基线 S3 ¥1,299 → 10:18 AI 解析邮件(改2/增1/待确认1,上市日期置信74%)→ 10:24 王芸确认 ¥1,199、同步 3 文档、续航 12→14、加「活跃渠道数」KPI → 10:32 XSRC-001 缓存价 ¥1,299 ≠ 权威 ¥1,199。
> 成员:王芸(ADMIN)/李晓(研发)/陈默(渠道运营·数据只读+表达可编)/周然(法务·纯只读)。
> 路由:`/us/source/{code}` 网格 · `/us/expr/{exprId}?form=doc|canvas|matrix|bi|ana` · `?drawer=chat|review|lineage` · `/us/source/validate` 校验 · `/us/settings/access` 审批 · `/us/preview` 内核联调 DEV。剧本 expr id:规格书=`exp-spec-doc`、看板/BI=`exp-dashboard`、图形=`exp-portal`、矩阵=`exp-inventory`(如与实际不符,以首页链接为准)。

## 0. 前置(建空间 + 种子 + 切 backend)

- [ ] 起服:`node scripts/dev-up.mjs`(server + web + proxy)。
- [ ] 工作台首页「新建项目」建一个空空间,记下 **workspaceId**。
- [ ] 打开 `/us/preview` →「内核联调 · DEV」区:模式切 **Backend**、填 workspaceId、点**种子**;`seedReport` 应显示 createdObjects / createdRelations 非 0、failed 为空。
- [ ] 进入 backend:地址栏 `…/us/home?backend=1&ws=<workspaceId>`;顶栏出现 **`KERNEL · {ws} · 内核直写`** ribbon = 已在真内核。
- [ ] 装载报告:顶栏 title 或 preview 报告显示 `N objects · M relations · K dangling`,dangling 应为 0 或极少。

**基线核对(不靠手工复制的前提):**
- [ ] 进产品规格库数据源(首页链接 → `/source/…`),S3 的 `price` = **¥1,299**、续航 = **12**(来自内核,非 seed 手填)。

## 1. 获取数据(结构化导入 / AI 导入)

- [ ] `/us/import` backend 段出现「**结构化导入**」面;粘一小段 JSON 制品(样例已预填)→**预览**见 diff 摘要(对象新增 N)→**确认导入**→Toast「已导入 N,跳过 M」→**自动重载**后,新对象出现在网格。
  - 判定:重载后网格能看到导入对象 = 数据经内核回流,非手工。☐通过 ☐缺口:____
- [ ] (可选)6a 脚本 AI 导入仍可演示(改2/增1/待确认1);backend 下「同步内核提议」旁路可见(若内核有 PROPOSED 集)。

## 2. 协同建数(写回内核)

- [ ] 网格把 S3 `price` 改为 **¥1,199**;回车/确认后本地即时变更(乐观写)。
- [ ] **验证真落内核**:换一处看同一空间(工作台该对象详情,或 `/us/preview` 报告重载),`price` = ¥1,199。☐通过 ☐缺口:____
- [ ] **断后端看回退**:临时停 server → 触发一次写 → 应见冲突/失败 Toast + 本地回滚(不静默)。恢复 server。☐通过 ☐缺口:____
- [ ] **选中联动**:网格选中 S3 → 切到图形/文档,同一对象高亮同步。☐通过 ☐缺口:____

## 3. 多视图表达(同一数据、多种说法)

- [ ] `/us/expr/exp-spec-doc?form=doc` 规格书:引用 S3 `price` 的 RefChip 显示 **¥1,199**(改价后 live 同步,3 处引用刷新态)。☐通过 ☐缺口:____
- [ ] `/us/expr/exp-portal?form=canvas` 图形、`/us/expr/exp-inventory?form=matrix` 矩阵、`/us/expr/exp-dashboard?form=bi` 看板:同一 S3 数据在各视图一致呈现。☐通过 ☐缺口:____
  - 注:视图配置/表达层(布局、docModel、BI 卡)是前端投影(G6/G7,by design),只需**值**与内核一致,不要求配置也进内核。

## 4. 执行检查(校验接内核)

- [ ] `/us/source/validate` 9c「立即运行」:本地富结果(XSRC-001 对比面板:缓存价 ¥1,299 ≠ 权威 ¥1,199)+ backend 出「**内核校验(权威)**」面板 + Toast「内核校验:N 命中」。☐通过 ☐缺口:____
- [ ] 有 error(XSRC-001 或内核 BLOCK)时,顶栏**分享/生成禁用**;修复/设为例外后解锁。☐通过 ☐缺口:____

## 5. 生成数据(AI 变更集 + 模板实例化)

- [ ] `?drawer=chat` AI 对话:把续航 **12→14**、加「活跃渠道数」KPI;逐项确认 → 经写桥落内核(换视图/重载值仍在)。☐通过 ☐缺口:____
- [ ] 模板实例化(装机域配置单):拖/点实例化槽位 → 建对象经内核 CreateObject。☐通过 ☐缺口:____

## 6–7. 特性复用 / 分析仿真(本轮不验)

- 特性复用(装配/映射)= 阶段2后期,未接,跳过。
- 分析 9a / 仿真 9b = 前端派生(G4 by design),回放为本地,不接内核,跳过。

## 8. 数据审阅与评价(审批 + 评审批注)

- [ ] 切 **陈默**:在网格改 S3 数据字段 → 前端闸 `requestWrite` 转**待审批**(不直发内核)。☐通过 ☐缺口:____
- [ ] 切 **王芸** → `/us/settings/access` 审批卡「批准并写入」→ 内核写以**王芸**为 `X-Actor-Id`(陈默仅本地归属)。☐通过 ☐缺口:____
- [ ] 选中对象/字段 → `?drawer=review` 评审批注:王芸加批注(带 anchoredDataVersion)→ resolve;切 **周然**(VIEWER)drawer **只读**(无加/resolve 入口)。☐通过 ☐缺口:____
- [ ] `/us/settings/access` 每成员显示空间角色:王芸 ADMIN / 李晓 AUTHOR / 陈默 AUTHOR / 周然 VIEWER;陈默注「数据只读 + 表达可编」。☐通过 ☐缺口:____

## 9. 成果输出与制品交换(导出 + 导入)

- [ ] 无校验错时,模板页「导出 DOCX / PDF / CSV」→ 内核 captureSnapshot→createOutput→下载文件;有校验错时导出禁用。☐通过 ☐缺口:____
- [ ] 导入(第 1 步)= 制品回写另一半,已验。

## 10 + 血缘. 追溯

- [ ] 选中派生字段 → `?drawer=lineage` 血缘 drawer:上游 ← 字段 → 下游 + algorithm 徽标(stored/derived/rule);Mock 下退化为本地引用下游。☐通过 ☐缺口:____
- [ ] 资产沉淀(assets)= 阶段4/MVP 轻量,未接,跳过。

## 收尾:双模式与事实源

- [ ] 去掉 `?backend`(Mock 模式):全流程零回归,剧本照走;结构化导入面禁用+提示。☐通过 ☐缺口:____
- [ ] `git status` 干净(走查不产生代码改动)。
- [ ] 结论:门锁 11 步必做闭环(1–5、8–9 + 血缘)是否**端到端不靠手工复制**打通? ☐是 ☐否
- [ ] `corepack pnpm verify:web` 全绿(若此前未跑)。

## 缺口汇总(走出来填这里,回来按此出卡)

| 步 | 缺口现象 | 猜测原因 | 优先级 |
|---|---|---|---|
| | | | |
| | | | |
