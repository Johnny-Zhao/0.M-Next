# 任务卡 T-V33-705 — 阶段7 批2:ReqIF 交换(最小子集,双向)

- 状态:**可下发**(无内核契约门、无新依赖[内置 javax.xml]、无迁移;从最新 main 切出即可开工)
- 分支:`feat/T-V33-705-reqif-exchange`(从最新 main 切出,AG-401)
- PR 要求:`Spec-Ref: 说明书 §F.5 标准对齐/§9 成果输出与制品交换, OMG ReqIF 1.1, docs/10-exchange-formal.md §3, AGENTS.md AG-108/110/201/208/507` + AG-405 自检输出段
- 依据:`docs/10-exchange-formal.md` §3;承 701(diff)/702(JSON 双向骨架)/704(快照 A 侧)
- 对应:阶段7 正式交换——首个真实外部标准(需求交换 ReqIF)
- 排期:依赖 701/702/704,均在 main

## 目标

落地 **ReqIF 最小子集的双向交换**:导出 = 快照/当前读模型 → ReqIF XML;导入 = 解析 ReqIF → 按 IDENTIFIER 映射内部 DataSet → `StructuredDiff`(vs 快照/current)→ 冲突 → 经 **M1 命令**回写(承 702)。**engines/exchange 纯解析/映射(无主数据写、无命令、不被内核 import,AG-108);回写在 server 经命令入口(AG-110);用内置 XML,无新依赖。**

## ReqIF 最小子集(冻结)

- **支持**:`REQ-IF` 根 + `REQ-IF-HEADER`;`DATATYPE-DEFINITION-{STRING,INTEGER,BOOLEAN,ENUMERATION,REAL,DATE}`;`SPEC-OBJECT-TYPE` + `ATTRIBUTE-DEFINITION-{STRING,INTEGER,BOOLEAN,ENUMERATION,REAL,DATE}`;`SPEC-OBJECT`(IDENTIFIER/LONG-NAME/TYPE/VALUES→`ATTRIBUTE-VALUE-*` with DEFINITION-REF + THE-VALUE);`SPEC-RELATION-TYPE`;`SPEC-RELATION`(TYPE/SOURCE/TARGET)。
- **映射**:SPEC-OBJECT-TYPE↔objectTypeCode;ATTRIBUTE-DEFINITION-*↔field(code=LONG-NAME/约定,dataType 由 DATATYPE 决定);SPEC-OBJECT↔object(IDENTIFIER=key,TYPE-REF→objectTypeCode,ATTRIBUTE-VALUE→fields);SPEC-RELATION↔relation(TYPE→relationTypeCode,SOURCE/TARGET→sourceKey/targetKey);XHTML 值按纯文本/string 处理。
- **不支持(本卡)**:`SPECIFICATIONS`/SpecHierarchy 层级文档树、ReqIF.xhtml 富文本结构、工具扩展(`<xhtml:*>`、TOOL-EXTENSIONS)、嵌入对象、ReqIF.z(zip)打包(只收/发 `.reqif` XML)、多 datatype 的 enum 多值高级特性。

## 涉及文件(封闭清单)

- **新增** `packages/engines/src/main/java/com/mnext/engines/exchange/reqif/`:`ReqIfCodec`(parse XML→中间模型 / serialize 中间模型→XML,用 `javax.xml.parsers`/DOM)、`ReqIfMapper`(中间模型 ↔ `DataSet`,按 IDENTIFIER 对齐,承 702 ArtifactMapper 风格)、必要的 record(ReqIfDocument/SpecObject/SpecRelation/DatatypeDef…)。**纯运算,无 Spring/JDBC/SQL/命令。**
- **新增** engines 测试 `ReqIfExchangeTest`。
- **修改/新增** `packages/server/.../ExchangeController.java`(或新增 `ReqIfController`):`GET .../exchange/reqif/export?base=snapshot:{id}|current&objectType=`、`POST .../exchange/reqif/preview`、`POST .../exchange/reqif/apply`,**复用 702 的 apply 编排**(按 diff 发 CreateObject/UpdateFields[expectedFieldVersion]/CreateRelation,source=`artifact_sync`,removed 不自动删,KERNEL-409→unapplied)。
- **新增/修改** server 测试 `ReqIfControllerTest` + `ReqIfIntegrationTest`;扩 `ExchangeArchitectureTest` 覆盖 `reqif` 子包仍纯(无 spring/jdbc/sql/命令)。
- **禁止新增依赖(AG-502)**:仅用 JDK 内置 `javax.xml`(DOM/SAX);不引 ReqIF/第三方 XML 库。

## 行为要求(逐条可测)

1. **导出**:`export` 由快照(AG-208,base=snapshot:{id})或 current 读模型组装 ReqIF XML——DataSet 的 object→SPEC-OBJECT、字段→ATTRIBUTE-VALUE、关系→SPEC-RELATION、对象类型/字段定义→SPEC-OBJECT-TYPE/ATTRIBUTE-DEFINITION、dataType→DATATYPE-DEFINITION;只读。
2. **预览**:`preview` 解析 ReqIF→映射→`StructuredDiff.diff(base, parsed)`→DiffResult(**零写**,AG-201)。
3. **应用**:`apply` 按 diff 发 M1 命令回写(承 702 语义:added→CreateObject、changed→UpdateFields 带 expectedFieldVersion、relation added→CreateRelation;source=artifact_sync;**removed 不自动删**;KERNEL-409 等冲突逐项落 unapplied、不回滚)。
3.5 **往返**:`toDataSet(parse(serialize(ds)))` 语义保身份(objectId/类型/字段/关系一致)。
4. **健壮性**:格式非法/缺 IDENTIFIER/未知 datatype/SOURCE|TARGET 指向不存在对象 → 明确拒绝(`KERNEL-400-SCHEMA-INVALID` 或 400),不静默吞。
5. **隔离**:engines/exchange/reqif 纯——无主数据写、无命令、不被 kernel import(AG-108);回写唯一通道是 server 经 `KernelCommandService`(AG-110);外部 ReqIF 文件永不作事实源(AG-507)。

## 测试要求(jacoco ≥0.80;AG-504 禁 sleep)

engines `ReqIfExchangeTest` 必含:序列化往返保身份;datatype 矩阵(string/integer/boolean/enum/real/date 各一)解析+导出;按 IDENTIFIER 映射 added 对象/关系;非法 XML / 未知 datatype / 缺 IDENTIFIER / 关系端点缺失被拒;**架构断言**(由扩展的 ExchangeArchitectureTest 覆盖)reqif 子包无 spring/jdbc/sql/命令。server `ReqIfIntegrationTest`:export(snapshot 与 current)→ preview 出正确 diff → apply 经 CreateObject/UpdateFields 回写、读模型刷新可见;字段冲突→409 未应用项;removed 不删。

## 验收标准(机器可判)

1. `pnpm verify` 全绿(贴 jacoco 段);2. `pnpm architecture:check` 通过(reqif 在 engines/exchange、依赖 kernel/api+shared);3. 演示链:导出 demo 数据为 ReqIF → 改一个 ATTRIBUTE-VALUE + 加一个 SPEC-OBJECT → preview 出正确 diff → apply 经命令回写、读模型刷新;**全程 ReqIF 不作事实源、回写全经命令、导出走 snapshot**;4. `git diff --stat main` 限封闭清单;5. PR 含 AG-405 自检。

## 禁止事项

禁止实现:ReqIF SpecHierarchy/SPECIFICATIONS 文档树、XHTML 富文本结构化、工具扩展/TOOL-EXTENSIONS、ReqIF.z zip 打包、XMI(706)、removed 自动删除、双向自动同步、引入任何第三方 XML/ReqIF 库(只用内置 javax.xml)、任何 backlog。禁止触碰:`packages/{kernel,shared}/**`、主数据写路径、V1–V6 迁移、contracts/schemas、AGENTS.md、ADR/**、701/702/704 既有 engines 代码(StructuredDiff/ArtifactMapper/Snapshot 只复用不改)、packages/{views,web}/**。engines/exchange 不写主数据、不发命令(回写由 server 经命令入口);外部文件不作事实源(AG-507)。每步一 commit,完成后停止等待审查。
