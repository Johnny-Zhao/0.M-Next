# 任务卡 T-US-023 — P6 批1:场景无关 · 解耦门锁设计表达层(backend 只呈现内核数据源)

- 状态:**可下发**(A1 口径已拍板;依赖 P4/P5 + BE1 已合并;纯前端、零后端)
- 性质:P6 起步——把 backend 模式从"门锁设计稿写死"解耦到"跟着连的工作空间走"。**只动 `unisource/data`;Mock 模式门锁演示逐位不变**
- PR 要求:`Spec-Ref: docs/预研-P6-场景无关化.md、packages/web/src/unisource/data/kernel-gateway.ts(loadWorkspace 现装配)、packages/web/src/unisource/pages/home-view-model.ts(sources=workspace.objectTypes 已型驱动)、packages/web/src/unisource/pages/source-page.tsx(按 type.code 渲染网格)、packages/web/src/unisource/seed/demo-seed.ts(DemoSeed 形状)` + 自检输出段

## 背景与关键决策(必读)

**现状勘误(好消息):** 同源的"**数据源/网格**"其实**已经场景无关**——`home-view-model` 的 `sources` 直接来自 `workspace.objectTypes`(backend 下=内核类型),`source-page` `/source/{sourceId}` 按 `type.code` 过滤对象渲染网格。所以连任何域(门锁 `4444…` / 室内 `1111…` / 技术 `2222…` / MBSE `3333…`),**数据源列表和网格本就照内核真数据渲染**。

**真正写死门锁的,只有"表达层"**:`kernel-gateway.loadWorkspace()` 在 backend 模式下 `remapSeedPresentation(cloneDemoSeed(), …)`,把门锁种子的 **expressions(设计好的文档/看板/画布/装机模板面)/ docModels / fieldRefs / kpis / biBars / sceneTemplates / slotBindings / anaReports / simScenarios / 按 `exp-*` 键的 permissions** 塞进来、remap 到内核对象上。连别的域,这些门锁面全**错位/悬空**。

**决策 1 —— 本卡=把门锁设计表达层从 backend 解耦(A1 地基)。**
backend 模式 `loadWorkspace` **不再注入门锁种子的设计表达层**:`expressions`/`docModels`/`fieldRefs`/`kpis`/`biBars`/`sceneTemplates`/`slotBindings`/`anaReports`/`simScenarios` **一律置空**;**不再调用 `remapSeedPresentation`**(空表达层无可 remap)。`objects`/`relations`/`objectTypes`/`relationTypes`/`changeEvents`/`activity` 仍取内核(现状)。**结果:backend 连任何域 → home 列该域数据源 + 网格可浏览可编辑,不再出错位门锁面。** 自动生成的"关系图/通用文档"面留 **P6 批2**;本卡先把地基解耦干净。

**决策 2 —— 权限给通用默认(内核才是权威 RBAC)。**
门锁 permissions 按 `exp-*`/门锁类型键,换域即失配。backend 模式 `permissions` 给**通用默认**:对当前 `members` × 内核 `objectTypes.code` 授 `edit`(admin 给 workspace owner/首个成员)。前端权限只是前端闸,**内核 016 写路径才是权威 RBAC**(越权由内核 PERM-403 兜底),故默认放行安全。真实资源级投影留 P6 批4。

**决策 3 —— members / workspace 保留。**
`members` 仍用种子四人(王芸/李晓/陈默/周然/ai)——它们是**演示身份**(RoleSwitcher/审批/G2 依赖),与"门锁数据"无关,可跨场景复用于演示;真实成员加载属 C 档(多人)。`workspace` 取内核(id + name)。

**范围裁剪:**
- 不做自动生成表达面(关系图/通用文档)——P6 批2。
- 不做真实成员加载、真实资源级 RBAC——后续。
- **Mock 模式零改**:仍 `cloneDemoSeed()` 全量门锁,精致演示原样保留。
- `remapSeedPresentation` 若因此全不被调用 → 本卡可删该函数 + 其测试(顺手),或留注释标记"P6 后清理";`objectBusinessKey`/`relationBusinessKey` 仍被 `seedDemoData`/`claimObject` 用,**保留**。

## 涉及文件(封闭清单)

- `packages/web/src/unisource/data/kernel-gateway.ts` —— `loadWorkspace()` backend 装配:表达层九片置空 + 通用默认 permissions + 不调 `remapSeedPresentation`;objects/relations/types 现状不变。(若 `remapSeedPresentation` 变全不用,顺手删该函数;`identity-remap.ts` 的业务键仍留。)
- `packages/web/src/unisource/data/kernel-gateway.test.ts` —— 断言:backend `loadWorkspace` 返回的 seed 里 `expressions`/`docModels`/`fieldRefs`/`kpis`/`biBars`/`sceneTemplates`/`slotBindings`/`anaReports`/`simScenarios` 为空;`objectTypes`/`objects`/`relations` 来自内核;`permissions` 覆盖内核类型(edit);用一份**非门锁**假内核类型(如 `room`/`furniture`)验证仍装配出可浏览 shell(证明场景无关)。
- (若删 `remapSeedPresentation`)`packages/web/src/unisource/data/identity-remap.ts` + `identity-remap.test.ts` —— 删该函数及其用例;保留 `objectBusinessKey`/`relationBusinessKey`。

**守护(不改、须绿):** `data/import-boundary.test.ts`;Mock 路径(`mock-gateway`/`demo-reset`)不动。

## 行为要求(逐条可测)

1. **backend 解耦:** `loadWorkspace()` 返回的 seed,九个表达层片全空;`objectTypes`/`objects`/`relations` 来自内核。
2. **场景无关证明:** 用非门锁假内核类型装配 → 得到含这些类型的可浏览 shell(数据源可列、网格可渲染),无门锁 `exp-*` 面。
3. **权限默认:** `permissions` 对内核每个 `objectType.code` 给成员 `edit`(owner/首成员 admin);网格在 backend 可编辑(写仍走 016→内核)。
4. **Mock 零回归:** Mock 模式仍全量门锁种子;home 门锁表达面、剧本、精致演示逐位不变;既有 Mock 测试零改动。
5. **不崩:** 表达层空时,home 只列数据源、expr 路由无对应面时优雅处理(不白屏——如 P6 批2 未到,访问 `/expr/*` 可空态或跳数据源)。

## 测试要求

vitest 共置。`kernel-gateway.test` 加 backend 解耦 + 非门锁类型装配 + 权限默认断言;既有测试零回归(尤其 Mock 装载与 seedDemoData)。

## 验收标准

1. `corepack pnpm verify:web` 全绿。
2. `git diff --stat main` 仅含 `kernel-gateway.ts`(+ 测试;+ 可选 identity-remap 删函数);**不含 Mock 路径/其他前端面**。
3. 手工链:`?backend=1&ws=44444444-…`(门锁)→ 数据源 + 网格照旧可编辑、无错位门锁表达面;换 `?ws=11111111-…`(室内设计)→ **home 列出室内设计的数据源、网格显示室内真数据**(场景无关兑现);去 `?backend` Mock → 门锁精致演示零回归。

## 禁止事项

- 只动 `packages/web/src/unisource/data/**`(+本卡 docs);禁碰 Mock 路径行为、其他前端面、views/server/contracts。
- 禁在 backend 注入任何门锁专属设计表达层;禁改 objects/relations/types 的内核装载(现状保留)。
- 禁做自动生成表达面(P6 批2)、真实成员/资源级 RBAC(后续);禁改 store 同步 API。
- 禁新增 npm 依赖;禁 localStorage 业务数据;CSS 无关(本卡不涉视觉)。

完成后停止,等待审查。
