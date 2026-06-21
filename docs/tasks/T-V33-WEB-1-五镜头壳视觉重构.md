# T-V33-WEB-1 — 前端 Phase 1:五镜头壳视觉重构

蓝本:`outputs/mnext-ui-v2.html`(Claude Design 高保真)+ `docs/平台UI-完整设计要求-ClaudeDesign.md`。**packages/web 域,纯前端**(无后端/契约/迁移改动)。前置:无(壳已在 main,本卡只重构外观与布局)。

定位:把现有功能完备但**视觉裸**的 `packages/web/src/app.tsx`(已接好 ViewClient/CommandClient/SelectionCoordinator + 五镜头切换 + DetailPanel + sync 轮询)**重构成新设计的壳**——顶栏 + 左栏 + 中列五镜头 + 右栏,套上设计的视觉语言(色板/字体/布局)。**它是其余所有前端屏的骨架**,优先做、复用最高、风险最低。

**硬边界:本卡只吃 `packages/views` 现有 `ViewClient` 已暴露的只读方法**(`objectTypes` / `objects` / `object` / `relations` / `tree` / `matrix` / `syncStatus`)与 `CommandClient`。设计里出现的**派生值 fx 芯片、规则告警灯(BLOCK/WARN)、推荐四方法、provenance 溯源**等,其底层 view API **尚未暴露对应字段**——本卡**只把这些区域的版式/视觉占位搭好,不得编造数据,不得新增/改动 view-API 契约或后端**(那是后续卡 + 人发起的契约变更)。右栏沿用现有 `DetailPanel`(重构外观),不重写其取数逻辑。

## 范围

### A. 壳布局重构(`packages/web/src/app.tsx`)
保留全部现有数据接线(workspace state、selection、viewClient/commandClient、sync 轮询、五镜头切换、错误计数),只重排 DOM 与类名为三段栅格:
- **顶栏**:`M-Next` 标志 + `DATA HUB` 单色徽标(Mono 字体);工作空间下拉(沿用现有 `select`)+ profile 标签(只读展示,值取当前 workspace 名,profile 暂用静态占位文案);全局搜索框 `搜索对象 / 关系 / 规则,或运行命令… ⌘K`(**纯 UI,不实现命令面板逻辑**,input 只读占位或 no-op);`编辑模式` 切换钮(toggle 一个 `editMode` state + body 类名,**本卡不改各镜头的可编辑行为**,仅视觉态);用户头像占位。
- **左栏**(~280px):`工作空间` 区(当前 workspace 名 + profile);`导航` 区(模型浏览器=当前壳,其余如分析运行器/比选/报告导出为**禁用占位项**,标注"后续");`对象类型` 区——遍历 `viewClient.objectTypes(wid)`,对每类型调 `viewClient.objects(wid, type, 0, 1)` 取 `total` 作计数徽标(**只读、有界、每类型一次**;失败则计数显示 `—`,不抛壳)。
- **中列**(1fr):镜头标签条 `树 / 表 / 图 / 矩阵 / 文档`(沿用现有 `activeView` 切换,补齐图标与激活态视觉);其下为现有镜头组件区(`TableView`/`TreeView`/`GraphView`/`DocumentView`/`MatrixView`,**props 不变**)。
- **右栏**(~320px):标题 `实时结论`;主体沿用现有 `<DetailPanel>`(props 不变),外层套设计的卡片版式。派生值/规则灯区域**结构占位 + 注释 `TODO(WEB-2):接 view-API 派生标记/规则检查`**,不填假数据。
- 底栏:沿用现有 `待同步事件 / 错误` 计数,套 footer 样式;`SyncBadge` 用语义色点(绿已追平 / 黄同步中 / 红异常)。

### B. 视觉语言(`packages/web/src/styles.css`)
落设计令牌为 CSS 变量并应用到壳:
- 品牌紫 `--brand:#5B5BE6`(hover `#6D6DF0`,deep `#6B4FD6`);AI 紫 `--ai:#9B5BE0`;OK 绿 `--ok:#22A06B`(bg `#E6F6EE`);BLOCK 红 `--block:#E0556E`(bg `#FCE7EC`);WARN 琥珀 `--warn:#C98A1E`(bg `#FBF1DD`)。
- 墨/灰阶:`--ink:#23234A`、`--ink-2:#42425E`、`--muted:#6A6A85`、`--faint:#A0A0BE`;边框 `--line:#E4E5F2`/`#E9EAF5`/`#EEEFF8`;面板底 `--panel:#F4F5FB`/`#F7F8FD`。
- 字体:正文 system-ui;代码/徽标(DATA HUB、对象代号、fx)用 `'IBM Plex Mono', monospace`(**仅 CSS font-family 引用,不引入字体文件/新依赖**,缺失时回退 monospace)。
- 布局:CSS Grid 三栏(`280px 1fr 320px`),顶栏/底栏固定;镜头标签条与卡片圆角/阴影按设计。
- 语义状态点/徽标类:`.dot-ok/.dot-warn/.dot-block`、`.chip-fx`、`.chip-hub`(供 A 与后续卡复用)。

### C. 测试(`packages/web/src/app.test.tsx`)
扩现有测试(不破坏既有断言):
- 渲染壳:顶栏含 `DATA HUB`、`编辑模式`;左栏含 `对象类型`;五镜头标签可切换(点 `树` → TreeView 区出现,点 `表` → TableView 区出现)。
- 对象类型计数:mock `fetchFn` 让 `objectTypes` 返回 ≥1 类型、`objects` 返回带 `total` 的页 → 计数徽标渲染该 total;`objects` 失败 → 显示 `—` 且不崩。
- `编辑模式` toggle:点击后 body/根容器加 `edit` 类(断言类名切换)。
- `SyncBadge`:沿用现有 `syncLabel` 断言不变。

## 封闭文件清单
**修改**
- `packages/web/src/app.tsx`(重排布局 + 顶/左/右栏 + 对象类型计数;数据接线不变)
- `packages/web/src/styles.css`(设计令牌 + 三栏布局 + 语义类)
- `packages/web/src/app.test.tsx`(扩壳结构/计数/编辑态测试,不改既有断言)

**新增(可选,若 app.tsx 过长则拆)**
- `packages/web/src/shell/TopBar.tsx`、`LeftRail.tsx`、`RightRail.tsx`(纯展示组件,只接 props,无取数;由 app.tsx 组合)

**零碰**:`packages/views/**`(镜头/DetailPanel/client 内部一律不动,props 调用方式不变)、所有后端 `packages/{shared,kernel,engines,server}`、`contracts/**`、`db/migration/**`、其它 package。

## 红线 / 门禁
- **纯前端、只读**:仅用 `ViewClient` 已有方法 + `CommandClient`;**不新增/改 view-API 契约、不碰后端、不加迁移**(AG-301/501)。
- **不编造数据**:派生 fx / 规则灯 / 推荐 / provenance 区域只搭版式占位 + `TODO(WEB-2)` 注释,**严禁填充后端尚未提供的字段**。
- **不动 packages/views**:镜头组件与 DetailPanel 内部、client 签名一律不改;app.tsx 对它们的 props 用法保持不变。
- **不引新依赖**(AG-502):无 Tailwind/UI 库/字体文件;纯 CSS;`'IBM Plex Mono'` 仅作 font-family 回退引用。
- 对象类型计数有界:每类型最多一次 `objects(...,0,1)`;失败降级为 `—`,不阻塞壳渲染。
- `corepack pnpm verify` 全绿(含 web vitest、lint、type-check);不降覆盖率门槛。
- AG-405 落盘自检;**分支 `feat/T-V33-web-1` 提交不合并**;基线落后只 `git merge main` 拉平,不夹带其它增删;完成发 `git diff --stat main` + `pnpm --filter @m-next/web test` 汇总。
- 若要做到设计效果**必须**改 packages/views 或新增 view-API 字段——**停下回报,不夹带**(留给 WEB-2 + 人发起契约)。

## 验收
1. `corepack pnpm verify` 全绿;`packages/web` 测试全过,新增断言覆盖:壳三栏渲染、五镜头切换、对象类型计数(成功/失败降级)、编辑态 toggle。
2. 视觉:顶栏(M-Next + DATA HUB + 工作空间/profile + 搜索占位 + 编辑模式 + 头像)、左栏(工作空间 + 导航占位 + 对象类型计数)、中列(五镜头标签 + 镜头区)、右栏(实时结论 + DetailPanel + 占位区)、底栏(sync/错误)按设计令牌成形。
3. 行为回归:五镜头切换、选择联动 DetailPanel、sync 轮询徽标、错误计数与重构前一致。
4. 无新依赖(`pnpm-lock.yaml` 仅因无关无变化);无后端/契约/迁移 diff;`packages/views` 零 diff。
5. 派生/规则/推荐/provenance 区为版式占位且带 `TODO(WEB-2)`,无假数据。

## 跟进(本卡不做)
- **WEB-2**:扩 `view-client` + 右栏实时结论接**规则检查状态/派生标记**(很可能需人发起的 view-API 契约新增:每对象规则灯汇总 + 每字段 derived 标记)。
- WEB-3 对象详情页(派生 fx/provenance/附件)、WEB-4 分析·方法运行器、WEB-5 推荐四方法(补 WPM)、WEB-6 比选评分工作台(权重/一票否决)、WEB-7 报告导出、WEB-8 联邦·M2M 投影。
- 命令面板 ⌘K 实交互、编辑模式按 RBAC 角色门控(待 RBAC 前端接入)、loading 骨架 / empty 空态 / error 重试 状态矩阵补齐。
