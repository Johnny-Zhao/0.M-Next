# 任务卡 T-US-BE1 — 后端:门锁场景 profile(让 backend 端到端走查跑得起来)

- 状态:**可下发**(后端特批卡,仿 G1 模式;解开门锁 backend 走查的唯一硬阻塞)
- 性质:**后端特批卡**——在后端注册"门锁/装机"场景 profile(对象类型/字段/关系)+ 一个门锁 Demo 工作空间;**门锁对象仍由前端 `seedDemoData` 播种**(前端 seed 是门锁数据唯一事实源,不在 Java 里重抄)
- PR 要求:`Spec-Ref: packages/server/.../DevSeedRunner.java(interior/technical/mbse 装载范式)、packages/server/.../plugin/ProfileLoader.java + ProfileManifest.java(manifest 结构与 install 流程)、packages/domains/interior-design/profile.manifest.json(manifest 范式)、packages/web/src/unisource/seed/demo-seed.ts(门锁 objectTypes/relationTypes/字段——权威源)、docs/走查-门锁MVP-backend端到端.md` + 自检输出段

## 背景与关键决策(必读)

**为什么需要这张卡:** 后端 `DevSeedRunner`(`@Profile("dev")`)启动时装了三个域并各建一个 demo 工作空间:**室内设计(`interior_design`)/技术方案(`technical_proposal`)/MBSE(+SysML+映射)**。但**门锁/装机(`hardware_products`/`product_specs`…)只存在于前端 `seed/demo-seed.ts`,后端全无这些对象类型**。因此 `?backend=1&ws=…` + 前端 `seedDemoData` 会全部 `missingTypes`,门锁这条 backend 端到端走查**根本跑不起来**——这不是前端 bug,是门锁场景从没在后端注册过。用户已拍板 **A:给后端补门锁 profile,保留前端全部门锁工作**。

**决策 1 —— 门锁 profile 从前端 seed 派生。**
新增 `packages/domains/hardware-products/profile.manifest.json`,**镜像 `interior-design/profile.manifest.json` 的结构**(`id/name/version/templateCode/tags/valueTypes/objectTypes/fields/relations`)。内容**从 `demo-seed.ts` 派生**:对象类型 `product_specs`、`hardware_products`、`channel_sales`、`contracts`、`customers`;字段取各类型 `fields`(如 product_specs 的 sku/name/price/owner/battery_months/rating/launch_date/lifecycle;channel_sales 的 channel/month_sales/cached_price;contracts 的 name/product/channel/quote/contact/amount;customers 的 name/region;hardware_products 的 model/part_type/chipset/cores/form_factor 等——**以 demo-seed.ts 为准,逐字段覆盖**);关系 `interconnects_with`(product_specs→product_specs)。dataType 映射:demo-seed 的 `text`→`string`、`number`→`number`/`integer`、带 `unit:"CNY"` 的金额按 interior manifest 的 valueType 惯例(可加一个 `cny` valueType 或用 number),**参照 interior manifest 字段写法**。

**决策 2 —— 门锁对象不在 Java 里重抄,由前端 `seedDemoData` 播种。**
本卡只做 **profile(类型)+ 空的门锁 Demo 工作空间**;门锁**对象**继续由前端 `seedDemoData`(preview 页「内核联调 DEV」)按业务键推入(它已实现:CreateObject/CreateRelation,幂等)。这样门锁数据只有**一处事实源**(前端 seed),后端只提供类型骨架,零重复。(interior/technical 在 Java 里 `seedDemoObjects`,门锁走前端播种即可,更省且不双写。)

**决策 3 —— 固定门锁 Demo 工作空间 UUID。**
仿 `DEMO_WORKSPACE`,定一个常量 `HARDWARE_WORKSPACE`(固定 UUID),`ensureDemoWorkspace(hardwareManifest, actor, HARDWARE_WORKSPACE, "门锁 Demo")`。走查用 `?backend=1&ws=<HARDWARE_WORKSPACE>`。

**范围裁剪:** 不动 interior/technical/mbse/sysml 四域与其 manifest;不动 kernel、契约、schema、views、unisource 前端;不在 Java 里重抄门锁对象(用前端 seed);不加门锁的 derivedFields/rules(校验由前端本地引擎承载,017a;如日后要内核规则再单开)。

## 涉及文件(封闭清单)

- `packages/domains/hardware-products/profile.manifest.json`(**新增**)—— 门锁 profile,从 `demo-seed.ts` 派生,镜像 `interior-design` 结构;`templateCode: "hardware_products"`。
- `packages/server/src/main/java/com/mnext/server/DevSeedRunner.java` —— 加:`HARDWARE_WORKSPACE` 常量(固定 UUID)、`hardwareManifest()`=`manifest("hardware-products","hardware")`、`profileLoader.install(hardwareManifest, actor)`、`ensureDemoWorkspace(hardwareManifest, actor, HARDWARE_WORKSPACE, "门锁 Demo")`;放在现有三域装载序列之后;**不改既有三域逻辑**。
- (测试)`packages/server/src/test/...` —— 就近加/扩:门锁 profile 装载后 `object_type` 含 product_specs/hardware_products/channel_sales/contracts/customers、门锁 Demo 工作空间存在的集成断言(按仓库既有 DevSeed/ProfileLoader 测试惯例)。

## 行为要求(逐条可测)

1. dev 启动后:门锁 profile 装入 AUTHOR 空间;`HARDWARE_WORKSPACE` 门锁 Demo 工作空间存在,含上述 5 个对象类型 + `interconnects_with` 关系类型。
2. `GET /workspaces/{HARDWARE_WORKSPACE}/views/object-types` 返回 5 个门锁类型(带各自字段)。
3. **前端联通验证:** `?backend=1&ws=<HARDWARE_WORKSPACE>` + preview `seedDemoData` → `createdObjects` 非 0、`missingTypes` 为空、`failed` 为空。
4. manifest **覆盖 demo-seed.ts 全部**门锁 `objectTypeCode` / `fieldCode` / `relationTypeCode`(缺一个字段 → 该对象 CreateObject 会因未知字段被拒)。
5. interior/technical/mbse 三域装载与 demo 工作空间**零回归**。

## 测试要求

后端按仓库既有流程(`node scripts/run-maven.mjs test` 或惯用命令);门锁 profile 装载 + 工作空间 + 类型齐全的集成断言;既有 DevSeed/ProfileLoader 测试零回归。

## 验收标准

1. 后端测试全绿;`node scripts/dev-up.mjs` 起服后 `object-types` 可查到门锁 5 类型。
2. `git diff --stat` 仅含:新增 `packages/domains/hardware-products/profile.manifest.json` + `DevSeedRunner.java` +(可选)测试;**不含 kernel/其他域/契约/前端**。
3. **端到端联通:** 按 `docs/走查-门锁MVP-backend端到端.md` 前置——`?backend=1&ws=<HARDWARE_WORKSPACE>` → preview 种子成功 → 门锁对象进真内核 → 顶栏「内核直写」→ 可开始走查。PR 附 `seedReport`(createdObjects/missingTypes)截图或摘录。

## 禁止事项

禁改 kernel 模块、契约(contracts/schemas)、views 客户端、unisource 前端;禁改 interior/technical/mbse/sysml 四域 manifest 与其装载逻辑;禁在 Java 里重抄门锁对象(对象由前端 seedDemoData 播种);门锁类型/字段/关系必须与 `demo-seed.ts` 一致(它是门锁数据唯一事实源);不新增 kernel 命令或 profile 加载机制(复用 ProfileLoader.install)。完成后停止,等待审查。
