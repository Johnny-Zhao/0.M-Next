# 任务卡 T-V33-SYSML-XMI — SysML XMI 数据适配器(L1,最小子集)

- 状态:**可下发**(无契约门、无新依赖[内置 javax.xml]、无迁移;从最新 main 切出即可开工)
- 分支:`feat/T-V33-sysml-xmi-l1`(从最新 main 切出,AG-401)
- PR 要求:`Spec-Ref: OMG SysML v1/XMI, docs/13 §1 L1, docs/11 交换适配器 SPI, AGENTS.md AG-108/110/208/507/502` + AG-405 自检输出段
- 依据:`docs/13-sysml-executable-semantics.md`(L1);`docs/11-exchange-adapter-spi.md`(707 SPI);Backlog BL-10
- 对应:L1 —— SysML 数据互通(import/export),**实现 707 `ExchangeAdapter` SPI**;纯数据层,不含执行(执行见 L0/L2)
- **并行说明**:与 L0(仿真 SPI)文件集**不相交**,可并行开发;本卡**只动 `engines/exchange/sysml/*` + ExchangeAdapter services 追加 + 测试**,不碰 server / 迁移 / 其它适配器

## 目标

新增 `SysmlXmiAdapter`(实现 707 `ExchangeAdapter` SPI),把 **SysML v1 XMI** 的最小子集双向映射到内部 DataSet:`uml:Class`(含 SysML «Block» 构造型)→对象、`ownedAttribute`→字段、`uml:Association`→关系。经 707 通用端点 `/exchange/sysml-xmi/{export,preview,apply}` 自动可用(**server 零改**);导入解析→映射→diff→经命令回写,导出走快照。**纯解析/映射、内置 javax.xml、无新依赖。**

## SysML 最小子集(冻结)

- **支持**:`packagedElement xmi:type="uml:Class"`(+ 可选 `«Block»`/`«requirement»` 构造型,经 appliedStereotype 或元素标签识别);`ownedAttribute xmi:type="uml:Property"`(name+类型→字段);`packagedElement xmi:type="uml:Association"`(memberEnd/ownedEnd → source/target by `xmi:id`)。
- **映射**:Class→对象(`xmi:id`=key、`name`→字段、objectTypeCode 由构造型定:`«Block»`→`sysml_block`、`«requirement»`→`sysml_requirement`、无构造型→`uml_class`);Property→字段;Association→关系(relationTypeCode `uml_association` 或由构造型细化)。
- **不支持(本卡)**:Port/FlowPort、Part/组合、Connector、StateMachine、Activity、Parametric/Constraint、Allocation、ValueType/单位、profile 完整语义、多包层级——**均后置(BL-10/11)**。
- **语义边界**:同 docs/10/§4——"结构化对象图"近似,非完整 MOF/profile 对齐;构造型仅用于定 objectTypeCode。

## 涉及文件(封闭清单)

- **新增** `packages/engines/src/main/java/com/mnext/engines/exchange/sysml/`:`SysmlXmiCodec`(parse XML→中间模型 / serialize,javax.xml DOM,承 ReqIfCodec 风格)、`SysmlXmiMapper`(中间模型 ↔ DataSet,按 xmi:id 对齐 + 构造型→objectTypeCode)、`SysmlXmiAdapter`(实现 `ExchangeAdapter`,formatId `sysml-xmi`、mediaType `application/xml`)、必要 record。
- **修改** `packages/engines/src/main/resources/META-INF/services/com.mnext.engines.exchange.ExchangeAdapter`:**追加一行** `com.mnext.engines.exchange.sysml.SysmlXmiAdapter`。
- **新增** engines 测试 `SysmlXmiExchangeTest`;扩 `ExchangeArchitectureTest` 覆盖 sysml 子包仍纯(或现有包级扫描已覆盖)。
- **不改**:server(走 707 通用端点)、kernel/shared、迁移、contracts、AGENTS、其它适配器、views/web。**禁止新增依赖(AG-502)。**

## 行为要求(逐条可测)

1. **导出**:由快照/current 的 DataSet 组装 SysML XMI——对象→`uml:Class`(objectTypeCode→构造型/类型)、字段→`ownedAttribute`、关系→`uml:Association`;含 uml/xmi 命名空间头;只读。
2. **导入**:解析 SysML XMI → 按 xmi:id 映射 DataSet;经 707 通用 preview/apply → `StructuredDiff` → 经 M1 命令回写(承 702/705:added→CreateObject、changed→UpdateFields[expectedFieldVersion]、relation added→CreateRelation;source=artifact_sync;removed 不自动删;KERNEL-409→unapplied)。
3. **往返**:`toDataSet(parse(serialize(ds)))` 保身份。
4. **健壮**:非法 XML / 缺 xmi:id / Association 端点指向不存在 Class / 未知 xmi:type → 明确拒绝(`KERNEL-400-SCHEMA-INVALID`/400),不静默吞。
5. **纯/隔离**:engines/exchange/sysml 无 Spring/JDBC/SQL/命令(AG-108);回写经 server 命令入口(AG-110);SysML 文件不作事实源(AG-507);导出走快照(AG-208,由 707 通用端点保证)。

## 测试要求(jacoco ≥0.80;AG-504 禁 sleep)

engines `SysmlXmiExchangeTest`:序列化往返保身份;`«Block»` Class→`sysml_block` 对象 + ownedAttribute→字段;Association→关系(两端 xmi:id 解析);非法 XML/缺 xmi:id/端点缺失/未知 type 被拒;`RenderRegistry`/`AdapterRegistry` 能取到 `sysml-xmi` formatId;架构断言 sysml 子包纯。

## 验收标准(机器可判)

1. `pnpm verify` 全绿(贴 jacoco;Skipped:0 需 Docker);2. `pnpm architecture:check` 通过(sysml 在 engines/exchange、依赖 kernel/api+shared);3. 演示链:导出 demo 为 SysML XMI → 改一 ownedAttribute + 加一 `«Block»` Class → `/exchange/sysml-xmi/preview` 出 diff → apply 经命令回写;4. `git diff --stat main` 限封闭清单(server/迁移/其它适配器零改);5. PR 含 AG-405 自检。

## 禁止事项

禁止实现:Port/Part/Connector/StateMachine/Activity/Parametric/profile 完整语义、元模型联邦(BL-11)、SysML 执行(L2)、removed 自动删、第三方 XML/UML 库(只内置 javax.xml)、任何 backlog。禁止触碰:`packages/{kernel,shared}/**`、server、主数据写路径、迁移、contracts、AGENTS、其它适配器(701/702/705/707 既有 engines 代码只复用不改)、views/web。engines/exchange/sysml 纯、不写主数据、不发命令;外部文件不作事实源(AG-507)。

## 给 Codex 的落盘自检(防截断)

每个新增 `.java` 落盘后:大括号配平 + 完整闭合;spotless:apply 不报 EOF;编译过再跑测试。禁止提交语法不完整文件。每步一 commit,完成后停止等待审查。
