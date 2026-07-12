# 任务卡 T-US-015 — 同源 P4 批2:KernelGateway 读路径 + 双模式开关(写仍本地)

- 状态:**可下发**(前端为主、零新依赖;手工验收需本地后端,见「前置条件」)
- PR 要求:`Spec-Ref: docs/预研-E3-同源Mock到内核契约对接.md(§二/§四/§五-批2)、packages/views/src/api/view-client.ts + command-client.ts(端点唯一权威)、docs/tasks/T-US-014(审查结论:三条注记修正)` + 自检输出段
- 序列位置:P4 五卡之 **批2**;016(写路径)接本卡的 gateway 与模式开关

## 前置条件(验收环境)

本地后端可跑:`node scripts/dev-up.mjs`(仓库既有);工作空间用现有工作台首页「新建项目」创建(unisource 不做建空间);拿到 workspaceId。Codex 开发期可全程用注入 fake fetch 的单测驱动,手工联调由用户执行。

## 背景与关键决策(必读)

014 已合入:接口契约/MockGateway/映射器/边界守护。本卡让**读路径**走真内核:同一个 unisource 壳,`?backend=1` 时数据域(对象/关系/类型/历史)来自后端,表达层(文档/画布配置/引用)仍是前端职责。本卡的演示目标是一句话:**工作台里改一个字段,同源刷新后看到新值——两个前端,一个内核。**

**决策 1:双模式在 boot 分岔,store 保持同步。** 模式解析:URL `?backend=1` 优先,其次 `localStorage["ui.us.backend"]`(UI 偏好,`ui.` 前缀合规 AG-102);workspaceId 取 `?ws=` 或 `localStorage["ui.us.workspaceId"]`。backend 模式:boot 先 `await kernelGateway.loadWorkspace()` 显示加载屏(纸底+Logo+Mono「正在从内核装载工作空间…」),成功后用**混合种子**构造各 store(路径与 Mock 完全一致,store 公开 API/同步性零改动);失败 → 错误面板(错误摘要 + 「重试」+「回退 Mock 模式」按钮,回退清 `ui.us.backend`)。Mock 模式:现路径原样。
**决策 2:loadWorkspace = 分页读装 + 业务键重映射,产出混合种子。** `data/kernel-gateway.ts`(白名单内,可运行时 import `@m-next/views`):
- 读装:`objectTypes()` → mapObjectType(建 code→kernelId 注册表);逐类型 `objects()` 分页循环 → mapViewObject;关系经逐对象 `object()` 详情收集 + 按 relationId 去重(演示规模 N 小,注释标注「聚合读模型端点为后续优化」);逐对象 `objectHistory(page0,size30)` → mapHistoryEntry,合并按 occurredAt 降序为 changeEvents/activity 初值(注释 G8);
- **重映射**(`data/identity-remap.ts`,纯函数+共置测试):内核对象 id 是服务端 UUID,seed 表达层引用的是 `prod-s3` 等演示 id;以**业务键**(objectTypeCode + name 字段值)建立 seed 对象 → 内核对象映射,重写表达层引用:fieldRefs.objectId、canvas/template 视图 config 节点、slotBindings.objectId、sim 事件 nodeObjectId/viaRelationId(关系按 typeCode+两端业务键匹配)、KPI/BI 来源如涉 id;**未匹配项 → 引用转 dangling(诚实呈现)**,并产出装载报告 `{matchedObjects, unmatchedRefs, …}`(DEV console + 顶栏 ribbon tooltip);
- 混合:数据域(objects/relations/objectTypes/relationTypes/changeEvents/activity)= 内核;表达层与演示域(expressions/views/fieldRefs/docModels/kpis/biBars/members/permissions/plugins/simScenarios/anaReports/sceneTemplates/slotBindings/chatMessages/rawImport/outputSnapshots)= seed 经重映射;返回 DemoSeed 形状。
**决策 3:种子工具进 gateway,入口在 preview 页(DEV)。** `kernelGateway.seedDemoData(seed)`:遍历演示数据域,经 CommandClient `CreateObject`(objectTypeCode→kernelId)/`CreateRelation` 写入后端;**幂等**:写前按业务键查已存在则跳过;返回 `{created, skipped, failed[]}` 报告。preview 页新增「内核联调 · DEV」区:模式/workspaceId 表单(写 `ui.us.*`)+「写入演示数据到后端」按钮 + 报告展示 + 当前装载报告。**类型缺口诚实处理**:后端工作空间若无对应 objectType(code 不存在),该域整体 skip 并在报告列明(元模型创建不在本卡)。
**决策 4:backend 模式写入仍是本地内存,必须明示。** 顶栏(workspace/full 两档)在 backend 模式追加 Mono ribbon:`KERNEL · {ws 短 id} · 写入本地(016 接管)`;resetDemo 在 backend 模式 = 重新 loadWorkspace(非回 seed);「重置演示数据」菜单项文案随模式切换。
**决策 5:014 审查三修(必做)。** ① gateway.ts `createObject/createRelation` 的 @gap 错编号(G3/G4)改为「机械差异:code→kernelId 解析(预研 §六-3)」;② AI 三方法 @kernel 注记改准:`POST /workspaces/{id}/ai-commands` + commandType `ProposeAiChange/ConfirmAiChange/RejectAiChange`;③ MockGateway.loadWorkspace 去双 cast:新增显式 `toDemoSeed(state, changeSets): DemoSeed` 组装函数(字段逐一列出,编译期保形)。

## 涉及文件(封闭清单)

- `data/kernel-gateway.ts`(新)— 决策 2/3;构造 `(baseUrl, workspaceId, actorId, fetchFn?)`;**仅本卡实现读面 + seedDemoData,写面方法一律 `throw new Error("T-US-016")`**(接口完整实现靠 throw 占位,并在 JSDoc 标注);
- `data/identity-remap.ts`(新,+测试)— 决策 2 重映射纯函数;
- `data/boot-mode.ts`(新,+测试)— 模式/ws 解析纯函数(URL 优先/localStorage 兜底/非法值回 Mock);
- `data/gateway.ts` / `data/mock-gateway.ts` — 决策 5 三修(**这是本卡唯二允许修改的 014 文件**);
- `boot.tsx` — 决策 1 分岔(加载屏/错误面板/回退);
- `shell/workspace-header.tsx` — 决策 4 ribbon(仅 backend 模式渲染,Mock 模式零变化);
- `state/demo-reset.ts` — 决策 4 重装分支;
- `pages/preview-page.tsx` — 决策 3 DEV 区;
- `us-components.css` — 追加 `.us-boot-*`(加载/错误屏)、`.us-kernel-ribbon`、preview DEV 区小段;随组件同 commit。

## 行为要求(逐条可测)

1. Mock 模式(默认)全链路零回归:不带参数打开 = 现状,《P2 走查》抽 5 步一致;顶栏无 ribbon。
2. backend 模式装载:`?backend=1&ws=<id>` → 加载屏 → 首页/表格/画布渲染**内核对象**(单测:fake fetch 夹具驱动 loadWorkspace,断言分页循环、关系去重、history 合并排序)。
3. 重映射:业务键命中 → 表达层引用指向内核 id(文档 RefChip 读到内核字段值);未命中 → dangling + 装载报告计数(单测两分支)。
4. 种子幂等:seedDemoData 空工作空间 → created=N;立即再跑 → skipped=N、created=0(fake fetch 单测);类型缺失域 → skip 报告。
5. 跨壳一致性(手工,用户执行):工作台表格改 S3 售价 → unisource 刷新(或 resetDemo 重装)→ 表格/文档 RefChip/矩阵卡显示新值。
6. 失败路径:后端不可达 → 错误面板;「回退 Mock」一键回默认模式且不再自动重试(清 `ui.us.backend`)。
7. localStorage 仅 `ui.us.backend` / `ui.us.workspaceId` 两键(AG-102;import-boundary 与 AG-102 守护不回归);业务数据零落盘。
8. backend 模式本地写入照常可用(演示不因写未接而卡死),ribbon 明示语义;014 三修生效(gateway JSDoc 与 toDemoSeed diff 佐证)。

## 测试要求(vitest 共置)

kernel-gateway:fake fetch 夹具(objectTypes/objects 两页/object 详情/objectHistory)→ loadWorkspace 组装断言;分页边界(恰好满页/空类型);seedDemoData 幂等两跑 + 类型缺失 skip;identity-remap:命中/未命中/关系两端匹配/装载报告;boot-mode 解析矩阵(URL/storage/非法);toDemoSeed 保形(编译期即测试);既有测试零回归(不允许改既有断言;014 三修若牵动 mock-gateway 测试,逐条注明)。

## 验收标准(机器可判 + 手工)

1. `corepack pnpm verify:web` 全绿(本机权威);tokens 门禁 0 违规;
2. `git diff --stat main` 限 `packages/web/src/unisource/**`;既有文件改动仅限封闭清单所列(boot/header/demo-reset/preview/两个 014 文件/CSS),每处在 PR 说明;
3. 手工(用户):`dev-up` → 工作台建空间 → preview 页写入演示数据(看报告)→ `?backend=1&ws=` 走首页/1a/7a/9c → 工作台改价 → 同源重装看新值 → 断后端看错误面板与回退;
4. 每步一 commit(建议:014 三修 → boot-mode/remap → kernel-gateway 读装 → seed 工具 → boot/壳接线 → preview DEV 区)。

## 禁止事项

禁止实现:内核写路径(UpdateFields 等真实下发,016)、乐观锁冲突 UI(016)、校验/AI 面接内核(017)、元模型/objectType 创建、轮询或 WebSocket 自动刷新(手动重装即可)、聚合读模型端点。禁止改 store 公开 API 与同步性;禁止在白名单两文件之外 import `@m-next/views`(kernel-gateway 为运行时 import 白名单内合法,边界测试维持);禁止 localStorage 业务数据(仅 `ui.us.*` 两键);禁止新增 npm 依赖;禁止触碰 unisource 之外的代码(scripts/server/workbench 一律不动)。完成后停止等待审查。
