# T-V33-CAPABILITY-CATALOG — 能力目录 / 即需即装 v1(可视化可装卸领域)

蓝本:平台"能力市场 / 即需即装"愿景。**packages/web + packages/views 域,纯前端,零后端/契约。** 前置:main(`/views/templates` 端点已有,`viewClient.templates()` 已封装并返回 `TemplateCatalogItem`;`commandClient.instantiateWorkspace(...)` 已可用;已有三领域模板)。
定位:平台已是"一套底座、可装卸多领域",但用户**看不见**有哪些能力可装——只有新建向导里一个下拉。本卡把"有哪些领域/模板可用"做成首页可浏览的**能力目录**,每张卡可一键开新项目,直观体现"即需即装"。

## 现状(已核实)
- `TemplateCatalogItem` 字段(以 view-client 类型为准):`templateId, code, name, version, latestPublishedVersion, publishedAt, description, typeOverview[](对象类型概览), typeOverviewTruncated`。
- `new-project-wizard.tsx` 已用 `viewClient.templates()` 拉模板、`commandClient.instantiateWorkspace(newId, templateId, version, name)` 建工作空间(本卡复用,不改其语义)。
- **无**行业/专业/场景标签字段(那部分由 MANIFEST-TAGS 后端卡补,本卡不依赖、不实现标签检索)。

## 范围(纯前端)
- **A. 能力目录视图**:首页新增/扩一块"能力目录"区(与现有项目列表并列或可切换标签页),调 `viewClient.templates()` 渲染**模板卡片网格**:每卡显示 名称、code、版本(latestPublishedVersion)、描述、`typeOverview` 里的对象类型 chip(截断时显示"+N 更多" 依 `typeOverviewTruncated`)、发布时间(publishedAt 为空显"未发布")。
- **B. 即需即装**:每张卡一个"用此能力新建项目"按钮 → 弹轻量命名输入(或复用现有新建向导组件)→ `commandClient.instantiateWorkspace(crypto.randomUUID(), templateId, latestPublishedVersion, name)` → 成功后刷新项目列表 / 跳转新工作空间;失败走 `reportError`(沿用 CommandFailure 文案)。
- **C. 交互/状态**:加载骨架、空态("暂无可用能力模板")、按 code 搜索框(纯前端 client 过滤,**非** MANIFEST-TAGS 的服务端标签检索);未发布模板("用此能力"按钮禁用 + 提示)。
- **D. 样式**:`--mn-*` 令牌、Fluent、亮暗双主题;卡片网格响应式。
- **E. 不改**:`/views/templates` 与 instantiateWorkspace 语义/签名;新建向导既有逻辑(可复用其建工作空间函数,不改行为)。

## 封闭文件清单
**修改/新增**:`packages/web/src/home/` 下新增 `capability-catalog.tsx`(+ 必要时 `.test.tsx`)、接入 `home.tsx`、`home.css`/`styles.css` 样式;只读复用 `viewClient.templates`/`commandClient.instantiateWorkspace`。
**零碰**:后端、契约、命令签名、`view-client`/`command-client` 方法语义、其它面板。

## 红线 / 门禁
- 纯前端;**零后端/契约/迁移/依赖**;不改任何端点/命令语义,只读 templates + 复用 instantiateWorkspace 渲染与建项。
- 不实现服务端标签检索(那是 MANIFEST-TAGS);本卡搜索仅 client 端按 name/code 过滤。
- 现有功能零回归(新建向导照常);`corepack pnpm verify` 全绿;亮暗双主题。
- 分支 `feat/T-V33-capability-catalog` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 首页能力目录列出三张模板卡(室内设计 / 技术方案 / MBSE),各显名称、描述、对象类型 chip、版本。
2. 点某卡"用此能力新建项目"→ 命名 → 新工作空间创建成功,出现在项目列表、可打开。
3. 搜索框按 code/name 过滤即时生效;空态/加载/未发布禁用友好;亮暗可切;verify 全绿;无后端/契约 diff。

## 跟进(本卡不做)
行业/专业/场景标签 + 服务端检索(MANIFEST-TAGS);"装到已有工作空间"(extends 增量装载);能力详情页/依赖说明。
