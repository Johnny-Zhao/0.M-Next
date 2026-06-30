# T-V35-C5 — SysML 需求 → MBSE 验证映射(灯塔线·第五步,把跨域拉进来)

> **packages/server(+ domains)域,后端;尽量零迁移(若必须则 V29)。** 前置:main(阶段二映射 profile/correspondence 机制、C1~C3 已合;SysML profile/XMI codec 已在仓库)。
> 把阶段二的跨域映射用在灯塔线上:SysML 侧的需求对应到 MBSE 验证侧的需求,体现"一套模型多领域 + 追溯到验证"。

## 目标
新建一个**映射 profile**,在已应用 SysML + MBSE 的工作空间里,定义 **SysML requirement ↔ MBSE requirement** 的 correspondence 对应(元模型层),使 SysML 需求可追溯到其 MBSE 验证覆盖。复用 2b 机制,不新造。

## 现状(已核实)
- 阶段二:`workspace_profile`(多 profile 项目)、映射 profile(`kind=mapping` + source/targetProfile)、跨 profile correspondence relation_type(V25 relation_kind)、`/views/mapping/*` 覆盖端点、映射视图都在。
- `SysmlProfileE2EIntegrationTest`、`engines/exchange/sysml/SysmlXmiCodec` 在仓库;mbse profile 在。
- 跨域映射"宿主=映射 profile、元模型层、可视"是阶段二已定方案。

## 范围(后端,尽量零迁移)
- **A. SysML profile 就绪**:确保 SysML 领域 profile 可 install(含 requirement 类型);dev 种一个最小 SysML demo 或在现有 MBSE demo 工作空间 ApplyProfile 加 SysML(多 profile 项目)。
- **B. 映射 profile**:`kind=mapping`,声明依赖 sysml + mbse;定义 correspondence relation:`sysml::requirement ↔ mbse::requirement`(经阶段二放开端点跨 tv 的机制)。
- **C. 种少量对应**:在 demo 工作空间放几条 SysML 需求并经 correspondence 关联到 MBSE 需求,使 `/views/mapping/correspondences` + coverage 能展示。
- **D. 复用,不新造**:走阶段二既有命令/端点/映射机制;若确需一处加性迁移则**锁 V29**(优先零迁移)。
- **E. 不改**:阶段二映射语义、读模型投影、其它领域、C1~C3 既有。

## 封闭文件清单
**修改/新增**:SysML/映射 profile manifest(domains)、`DevSeedRunner`(SysML demo + 映射对应种子)、必要时映射 profile 装载、相关 E2E;**若必须迁移→ `V29`**。
**零碰**:阶段二映射机制语义、读模型投影、其它领域、前端(映射视图已能展示)。

## 红线 / 门禁
- 复用阶段二映射机制;**优先零迁移(否则锁 V29、仅新增、零破坏)**;不改映射/读模型语义;不碰其它领域。
- 跨 profile correspondence 仅在映射 profile 内放开端点(领域内关系语义不变)。
- Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`,含 E2E)。
- 分支 `feat/T-V35-c5-sysml-mbse-mapping` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡文件;发 `git diff --stat main`(含迁移如有)+ 测试汇总。命中红线停下回报,不夹带。

## 验收
1. demo 工作空间同时应用 SysML + MBSE;映射 profile 定义 sysml::requirement ↔ mbse::requirement correspondence。
2. `/views/mapping/correspondences` 列出该对应;coverage 显示 SysML 需求映射/未映射到 MBSE;映射视图可看。
3. 阶段二/其它领域零回归;verify 全绿 Skipped:0。

## 跟进(本卡不做)
SysML 需求 → MBSE 验证覆盖的端到端追溯仪表;更多跨域对应(系统↔模块等)。
