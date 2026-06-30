# T-V36-XMI-1 — XMI 模型富化 + 映射可配 + 标准 profile 识别(完整双向·第一步)

> **packages/engines 域,引擎侧;零迁移、零碰读模型、零碰其它领域。** 前置:main(现有极简 sysml-xmi 双向);设计稿《设计-完整双向XMI交换》§3/§5。
> 完整双向 XMI 第一步:把硬编码两三个 stereotype 的极简映射,扩成覆盖结构+需求+参数化+追溯的**可配映射**,为后续文档锚定/往返打底。

## 目标
富化 `SysmlXmiModel`,重写 `SysmlXmiMapper` 使 **stereotype ↔ object_type/relation_type 从 SysML 领域 manifest 读**(不再写死 Block/requirement),覆盖设计稿 §3 映射子集;识别标准 SysML 1.6 profile。**本卡只做"看得见/映射得了"的元素层,文档锚定/身份/passthrough 留 XMI-2~4。**

## 现状(已核实)
- `ExchangeAdapter` 双向 SPI;`SysmlXmiAdapter`(formatId `sysml-xmi`)→ `SysmlXmiCodec.parse/serialize` + `SysmlXmiMapper.toDataSet/toXmi`。
- 现有映射硬编码:`objectType()/stereotype()` 写死 Block/requirement;只处理 Class/property/Association。
- `packages/domains/sysml/profile.manifest.json` 在仓库(C5 已确认),含 object/relation 类型声明。

## 范围(引擎,零迁移)
- **A. 模型富化**(`SysmlXmiModel`):从只有 Class/Property/Association,扩到能表达 §3 子集 —— Package、«Block»、«requirement»、Property/Part(区分组合)、Port、Association/Aggregation/Composition、Generalization、ConstraintBlock+BindingConnector(参数化)、ValueType/DataType/Enumeration、Dependency(satisfy/derive/verify/refine/allocate/trace)、Comment。
- **B. 映射可配**(`SysmlXmiMapper`):stereotype ↔ object_type、UML 关系/依赖 stereotype ↔ relation_type **从 sysml manifest 读**(声明式映射表),替代硬编码;manifest 未声明的 stereotype 归"通用/未知"(uml_class + 保留 stereotype 名,**为 XMI-3 透传留口**,本卡先不丢即可)。
- **C. 参数化接派生(标识层)**:ConstraintBlock/BindingConnector 映射到平台参数/派生可识别的关系/字段结构(**本卡只做结构映射与识别,不实做求值**;求值接现有派生层留后续)。
- **D. 标准 profile 识别**:识别 XMI 头的 SysML 1.6 profileApplication,标记"已知 profile",据此选用 manifest 映射表。
- **E. 不改**:`ExchangeAdapter` 接口、AdapterRegistry 注册、读模型、其它适配器(ReqIf/Json/Excel)、其它领域、迁移、前端。**文档锚定/身份表/passthrough/跨文档引用全部留 XMI-2~4,本卡不碰。**

## 封闭文件清单
**修改/新增**:`packages/engines/.../exchange/sysml/`(`SysmlXmiModel`、`SysmlXmiMapper`、必要时 `SysmlXmiCodec` 仅为读出新元素、映射表读取辅助类)、`packages/engines/.../exchange/SysmlXmiExchangeTest` 扩断言;若映射表需从 manifest 读,加只读解析辅助(不改 manifest 本身,只读)。
**零碰**:`ExchangeAdapter`/`AdapterRegistry` 签名、读模型投影、其它适配器、其它领域、迁移、前端、import-task。

## 红线 / 门禁
- **引擎侧,零迁移、零碰读模型/其它领域/其它适配器**;映射改为从 manifest 读,不硬编码。
- manifest 未声明的 stereotype 不报错、不丢(归通用,保留名),为 XMI-3 透传留口。
- 参数化本卡只做结构映射+识别,**不实做求值**。
- Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`,含引擎单测)。
- 分支 `feat/T-V36-xmi1-model-mapping` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡文件;发 `git diff --stat main` + 测试汇总。命中红线(要动 SPI 签名/读模型/迁移/其它领域)停下回报,不夹带。

## 验收
1. 一份含 §3 多类元素的 SysML 1.6 样例 `.xmi`,import 后各元素按 manifest 映射到对应 object_type/relation_type;未知 stereotype 归通用不丢。
2. export 回去,覆盖元素结构正确(完整往返保真留 XMI-4,本卡只验单向映射正确 + 既有往返不回归)。
3. 既有 `sysml-xmi` 行为零回归;其它适配器零回归;verify 全绿 `Skipped:0`;无迁移 diff。

## 跟进(本卡不做)
XMI-2 文档集锚定 + 身份保真(V30);XMI-3 项目引用图 + 跨文档解析 + 自定义 profile 透传;XMI-4 Delta 合并出向;XMI-5 无损往返 E2E;XMI-6 重导入/基线刷新。
