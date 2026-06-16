# 17 — SysML Profile 端到端验证(第一个插件)

状态:**设计稿(待确认)**。目标:用平台**已就绪的地基**把"SysML profile"端到端跑通,验证整条栈——也是 4 插件验证的第一炮。验证优先,**先不追求 SysML 全保真**(端口/全 stereotype 后置)。

## 0. 验证目标(一条链跑通)

> 用平台自身命令**授权一个 SysML profile** → 发布 → 实例化项目空间 → **导入 SysML .xmi**(经 L1 适配器 + 命令落库)→ 元素成为**带类型对象(Block/Requirement)** → **规则良构校验生效** → **视图显示**。

跑通即证明:M2 元模型 + 泛化 + 规则 + 模板生命周期 + 交换 SPI + 视图 **作为公共底座** 能承载一套真实标准 profile。

## 1. Profile 内容(MVP,与 L1 适配器 code 对齐)

L1 适配器映射:stereotype Block→`sysml_block`、requirement→`sysml_requirement`、其余→`uml_class`,关系→`uml_association`。故 profile 定义这些 code:

- **值类型**:复用内置 `text`/`string`;可定义 `sysml_id`(text 子类型,演示自定义值类型)。
- **对象类型(泛化树)**:`uml_class`(基类,字段 `name`)→ 子类 `sysml_block`(加 `properties` 等)、`sysml_requirement`(加 `req_id`、`text` 必填)。→ **演示泛化 + IS-A**。
- **关系类型**:`uml_association`(source/target=`uml_class`,两端经 IS-A 接受子类型)。
- **规则(良构)**:如 `requirement.text 非空`(BLOCK,lightweight)、`uml_class.name 非空`(BLOCK)。→ 演示规则热路径。

## 2. 授权方式

用平台命令把 profile 建出来:`DefineValueType` → `DefineObjectType`(带 parentTypeCode)→ `DefineFieldDef` → `DefineRelationType` → `DefineRule` → `PublishTemplateVersion`。MVP 以**集成测试里的 setup(发命令序列)**作为权威证明(证明平台能纯用自身机制授权 SysML profile);"可安装 profile 种子"作为后续产品化(不在本卡)。

## 3. 端到端验证(集成测试)

1. 授权并发布 SysML profile 模板版本(§2)。
2. `InstantiateWorkspace` 从该版本建项目空间(类型+值类型+继承+规则整套复制进来)。
3. 准备一份**样例 SysML .xmi**(含一个 Block、一个 Requirement、一条 association)。
4. POST 到通用交换导入端点(formatId=`sysml-xmi`)→ L1 适配器解析 → 经命令(CreateObject/CreateRelation)写入空间。
5. **断言**:
   - 两个对象落库,类型分别 `sysml_block`/`sysml_requirement`,字段(name/req_id/text)正确;
   - association 落成 `uml_association` 关系;
   - `ref`/端点 IS-A 生效(association 端点是子类型对象);
   - 良构规则:导入一个 `text` 为空的 requirement → 被 `RULE-422` 拦(或冷路径 check_result 出违例);
   - `/views/object-types` 显示 sysml_block/sysml_requirement **含继承字段**(name 来自 uml_class)。

## 4. 可能暴露的小缺口(验证副产物)

- 通用导入端点是否按 formatId 分发到 sysml-xmi、是否把 DataSet 的 objectTypeCode 解析成目标空间 objectTypeId 并经命令落库 + 建关系——若有断点,本卡补最小 glue(仍 server 域)。
- L1 导入与"目标空间须有 SysML 类型"的衔接(profile 实例化提供类型)。

## 5. 封闭文件清单(预估)

- `packages/server/src/test/.../SysmlProfileE2EIntegrationTest.java`(Testcontainers,授权 profile + 实例化 + 导入 + 断言)。
- 样例 `.xmi` 测试资源。
- 若发现导入管线缺口:`ExchangeController`/相关 server 导入逻辑的最小补丁(按发现再定,严守 server 域,不碰 kernel/engines 既有)。

零碰:kernel/engines 既有实现(只调用)、views/web、contracts、迁移。

## 6. 红线 / 门禁

- 导入写入经命令入口(AG-110);规则校验沿热路径(已有);视图只读(AG-101/102)。
- `pnpm verify` 全绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。

## 7. 验收口径

一条龙演示:发布 SysML profile → 建项目 → 导入一份 .xmi → 看到 Block/Requirement 带类型入库、association 成关系、空 text 需求被规则拦、视图列出继承字段。**第一个插件在平台上活起来。**

## 8. SysML 分级路线(本卡=S1,其余后续)

| 阶段 | 内容 | 依赖 / 性质 |
|---|---|---|
| **S1 MVP(本卡)** | uml_class→Block/Requirement(泛化)+ uml_association + 良构规则,端到端跑通 | 现在做,纯用地基 |
| **S2 全保真扩展** | Port/FlowPort/更多 stereotype(Interface/ConstraintBlock…)、关系细分(satisfy/derive/refine/allocate/itemflow) | S1 后;部分=profile 数据扩充,部分=**扩 L1 XMI 适配器映射**(加 code/stereotype 处理) |
| **S3 profile 可安装种子** | SysML profile 做成可安装/分发的种子(profile 打包/bootstrap 机制),产品化 | 等 S1/S2 profile 内容稳定后 |
| **S4 参数化/约束块** | «constraint» block + 参数绑定(parametric) | **硬依赖"派生/计算层"**(验证场景备忘的缺口);capstone,与总线带宽/Modelica 方程共享该层 |

依赖链:S1→S2→S3 顺次;**S4 ⟂ 派生/计算层**。派生/计算层是总线带宽、SysML 参数化、Modelica 方程的共同底层,届时统一做。
