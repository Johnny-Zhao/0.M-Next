# 设计稿 — 完整双向 XMI 交换(SysML/UML,B1 往返 + 项目引用)

> 状态:**设计稿(决策已定,可拆卡)**。来源:2026-06-30 与用户逐项确认。
> 纪律:本稿为 XMI 线唯一真值源 → 拆封闭卡发 Codex。引擎侧为主;身份/基线表一处迁移人工发起。

---

## 0. 已定决策(锁)

| # | 决策 | 结论 |
|---|---|---|
| Q1 标准锚点 | SysML 1.6 + UML 2.5.1 / XMI 2.5.1 | **锚 1.6**;SysML v2 走 API/JSON 另起一条线,**XMI 双向 ≠ v2**。 |
| 用途 | A 摄入 / B 往返 / C 发布 | **B 往返共存为主**。M-Next 当"架构在工具、验证/分析在 M-Next"的对等一环。 |
| B 分档 | B1 串行交接往返 / B2 并发冲突合并 | **B1 现在做**(同一时刻模型归属一边编辑,无损往返靠文档锚定+passthrough);**B2 押后**(模型版 git merge)。 |
| Q2 子集 | 见 §3 | 结构 + 需求 + **参数化(接派生)** + 追溯关系(satisfy/derive/verify/refine/allocate/trace);**行为图缓**(passthrough 保留)。 |
| Q3 passthrough | 文档锚定 vs 读模型 | **文档集锚定 + delta 合并**;无损靠 passthrough;不塞读模型。 |
| 项目引用 | 多项目互引 + 带元模型 | 身份按 **(project, xmi:id)**;基线=**文档集+引用图**;跨文档引用集合内解析→平台关系/correspondence,集合外→外部引用透传。 |
| 带元模型 | known / custom profile | known→映射现有类型;**custom→v1 保留即透传(现在)**;**v2 元模型摄入(→template_version)押后单列**。 |
| Q4 导出端点 | 引擎 vs 端点 | **先引擎 XMI-1~6**;导出端点+前端押后(契约,人发起)。 |
| Q5 DI 图形往返 | — | **无限期缓**;平台自渲染视图,保工具图布局近无收益。 |
| 迁移 | — | MANIFEST-TAGS 占 **V29**;XMI 身份/基线表锁 **V30**(带 project 维度,仅新增)。 |

---

## 1. 现状(已核实代码)

- SPI `ExchangeAdapter` 已双向:`importToDataSet` + `exportFromDataSet`;`AdapterRegistry` 按 `formatId` 注册;`sysml-xmi` 已注册。
- 现有覆盖极简:`uml:Class`(stereotype 字符串 Block/requirement)↔ 对象;`ownedAttribute`↔字段;`uml:Association`↔关系。`SysmlXmiModel` 27 行 / `Mapper` 172 / `Codec` 271。**硬编码两三个 stereotype**。
- 入向链路:`import-task`(V18,三级解析,已存原始 payload)、`SysmlXmiExchangeTest`、样例 `.xmi`。

**结论**:把极简双向扩成**完整、保真、项目集级无损往返**的双向。

---

## 2. 关键认知(为什么 B 在有界成本内能成)

**无损往返 ≠ 映射全集。** 往返不丢东西靠 **passthrough**(未映射子树/外部引用原样兜住),不是靠映射全集。所以:
- **映射子集(§3)= M-Next 能看见/能编辑/能分析**的部分。
- **passthrough = 其它全部照样活着**(行为图、未知 stereotype、未导入项目的引用、自定义 profile…)。

两者解耦,是 B + 项目引用在有界成本内可成的根。

---

## 3. 元素覆盖矩阵(映射子集)

| UML/SysML 元素 | 平台映射 | 备注 |
|---|---|---|
| Package / Model | 容器/命名空间 | 保留层级与 qualified name |
| Class «Block» | sysml_block | 富化属性 |
| «requirement» | sysml_requirement(id/text) | 补标准 reqt id/text |
| Property / Part(组合) | 组合关系 part_of | 区分 ownedAttribute vs part |
| Port / FlowPort | sysml_port + 关系 | 新增 |
| Association / Aggregation / Composition | 关系(按聚合种类) | 补 agg/comp |
| Generalization | 泛化(接 GEN-CORE M2) | |
| **ConstraintBlock + BindingConnector(参数化)** | **接平台派生/规则层** | **差异化高价值**:外部参数约束→我们的派生 |
| ValueType / DataType / Enumeration | value_type | |
| Dependency «satisfy/derive/verify/refine/allocate/trace» | 追溯关系 / correspondence | **直连 MBSE 灯塔追溯 + 阶段二跨域映射** |
| Comment | 注释字段 | |
| 行为图(状态机/活动/时序) | **缓,passthrough 保留** | 平台行为执行语义未接全;无损保留不丢 |
| 其它未覆盖元素 | **passthrough** | 见 §4 |

---

## 4. B1 往返架构(心脏)

1. **文档集锚定**:保留导入的**项目集**原始 XMI(每份文档),维护**当前基线**(每次重导入刷新)。import-task 已存 payload,扩为基线集。
2. **身份保真**:**(project/resource, xmi:id) → 平台对象/关系 id** 持久化对应(`xmi:id` 仅文档内唯一,必须带 project 维度)。M-Next 新建给新 id。
3. **引用图 + 跨文档引用**:
   - 集合内 href → 绑定对方平台对象,**升级为平台关系/correspondence**(走阶段二跨 profile 对应)。
   - 集合外 href → **未解析外部引用,reference 级 passthrough 原样兜住**,导出逐字回吐;**绝不丢、绝不臆造**。
4. **Delta 合并出向**:导出 = 把 M-Next 改动**就地打回**保留的基线文档集(改字段=原地改、加=注入、删=移除),引用图与外部 href 保真,passthrough 原样留。**不从零重建。**
5. **带元模型(profile 项目)**:
   - **known**(SysML 1.6 标准 / 已有领域 profile)→ stereotype 映射现有 object_type;profile 项目识别为"已会说的元模型",不当数据重摄。
   - **custom**(未知 profile)→ **v1 保留即透传**:profile 文档 + stereotype 应用整体兜住,无损往返;M-Next 当通用对象(uml_class + 保留 stereotype 名),能往返不深读。**v2 元模型摄入(→template_version)押后单列。**
6. **串行归属(B1)**:同一时刻模型归属一边编辑;只要不两边同时改就无冲突。**并发三方合并(B2)押后。**
7. **幂等 + 无损**:`import→改→export→再 import` 对覆盖内元素幂等,对未映射/外部引用字节级或语义等价无损。**用真实工具导出样例**(Cameo/Papyrus)断言。

---

## 5. 契约 / 迁移影响

- **引擎侧(主体,零迁移)**:富化 `SysmlXmiModel`、重写 `SysmlXmiMapper`(映射表从 SysML manifest 读,替代硬编码)、扩 `SysmlXmiCodec`(完整 XMI 2.5.1 读写 + passthrough + 跨文档 href)。
- **身份/基线(一处迁移,人发起)**:`(project, xmi:id)↔平台 id` 对应 + 基线文档集存储,**锁 V30,仅新增**。
- **映射可配**:stereotype↔类型从 `packages/domains/sysml` manifest 读(领域文件,非内核契约)。
- **导出端点**:押后(XMI-7,契约新增人发起)。

---

## 6. 分批卡(B1 + 项目引用)

- **XMI-1 模型富化 + 映射可配 + 标准 profile 识别**:扩模型/映射,覆盖 §3 子集;stereotype↔类型从 manifest 读;识别标准 SysML 1.6 profile。**零迁移**,引擎单测。
- **XMI-2 文档集锚定 + 身份保真**:`(project, xmi:id)` 身份表 + 基线文档集存储。**锁 V30(人发起)。** ← B 的地基。
- **XMI-3 项目引用图 + 跨文档解析 + 自定义 profile v1 透传**:集合内 href→平台关系/correspondence;集合外→外部引用 passthrough;custom profile 整体兜住。
- **XMI-4 Delta 合并出向**:改动打回基线文档集 + 引用图 + 外部 href 保真 + passthrough 保留。
- **XMI-5 无损往返 E2E**:**多项目真实工具样例**(主项目 + 库/profile 项目,含跨项目引用)做 import→改→export→再 import 幂等 + 无损断言。
- **XMI-6 重导入 / 基线刷新**:项目集级、串行归属下再同步。
- **押后单列**:**元模型摄入 v2**(custom profile→template_version)、**B2 并发冲突合并**、**XMI-7 导出端点+前端**、**DI 图形往返**。

> 迁移:仅 **V30**(XMI-2)。其余零迁移。契约新增(导出端点)押后人发起。

---

## 7. 红线 / 门禁
- 引擎侧为主;除 V30 外**零迁移、零碰读模型投影语义、零碰其它领域**。
- 映射声明式可配,不再硬编码 stereotype。
- 往返**无损**硬验收:未映射元素/外部引用/自定义 profile 透传不丢;覆盖元素幂等。
- 每张卡一分支从 main 起、先 commit 再 verify、只 add 本卡文件、命中红线停下回报不夹带;Docker 起着 `verify` 全绿 `Skipped:0`(含往返 E2E)。
- XMI-2 跨契约+迁移(V30),**人发起**,迁移仅新增、既有数据零破坏、回滚安全。

---

## 8. 押后清单(明确不在本程)
- 元模型摄入 v2(自定义 profile → 平台 template_version,使客户自定义 SysML profile 成一等领域)。
- B2 并发冲突合并(两边同时改之间的三方合并)。
- XMI-7 导出端点 + 前端"导出 XMI"入口。
- DI 图形/布局往返。
- SysML v2(API/JSON 线,与 XMI 无关)。
