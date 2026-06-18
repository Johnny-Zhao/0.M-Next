# 18 — 派生/计算层(完整能力,非 MVP)

状态:**设计稿(待确认)**。为总线带宽/时序、SysML 参数化(S4)、Modelica 方程的**共同底座**。目标:在"属性+关系"图上做**可配置、多跳链式、嵌套、多样**的计算。蓝本:验证场景备忘的"派生/计算层"缺口。

## 0. 能力目标(充分,不阉割)

> 用户在 profile 里**声明**派生属性:其值由本对象字段 + **沿关系多跳遍历**到的关联对象、经**聚合 + 算术 + 条件 + 引用其它派生**算出;按需求值,不存储;规则/视图可引用。

典型:`链路.总负载 = sum(traverse('carries'), 'load')`;`链路.余量 = field('带宽') - field('总负载')`(嵌套引用派生);`系统.总质量 = sum(traverseDeep('contains'), 'mass')`(多跳)。

## 1. 概念

- **派生属性(derived attribute)**:对象类型上的计算字段,**只读、不落主数据**;有 `derivation` 表达式。与 stored field 并列,在有效字段集中可见。
- **表达式语言(扩 `engines/rules`)**:在现有标量/比较/逻辑/白名单函数之上,新增:
  - **路径/遍历**:`traverse('relType', dir)` → 关联对象集合;`traverseDeep('relType', dir, maxDepth)` 多跳(有界);可链式 `traverse(...).traverse(...)`。
  - **聚合**(over 集合 + 目标字段):`sum/avg/max/min/count/any/all`。
  - **算术 + 条件**:`+ - * /`、`if(cond, a, b)`。
  - **引用**:`field('code')` 可指向 stored 或**另一个派生**字段(组合/嵌套)。
- **依赖图**:派生属性间形成 DAG;**定义期环检测**(A→B→A 拒);求值按拓扑序。

## 2. 定义方式(M2,可配置)

新命令 `DefineDerivedField`(meta-commands 家族):`objectTypeCode/code/name/resultType/derivation(表达式串)`;随模板版本发布锁版;参与泛化(子类型继承/可重定义派生,后置)。落 `field_def` 扩列(`derivation TEXT NULL` + `is_derived BOOL`)或独立 `derived_field` 表——设计稿定:**扩 field_def**(派生属性也是字段,统一进有效字段集与视图)。

## 3. 求值

- **时机**:读时计算(视图渲染、规则求值、导出),惰性 + 依赖序;不写主数据(AG-105)。
- **数据上下文**:纯求值器(engines)+ 只读上下文(本对象字段 + 沿关系取关联对象及其字段,经 server 仓储有界读 rm_*/data_*)。
- **有界与可终止**:遍历**深度上限**、结果集**大小上限**(AG-202/203)、求值**步数上限**(承规则求值器 RuleEvalLimit);超限抛错/降级,绝不无界。
- **环检测**:定义期(派生依赖 DAG)+ 运行期遍历深度兜底。
- **确定性**:同图同输入同结果。
- **缓存**:MVP 按需算 + 上限;大图缓存/增量作为**性能后续**(标注,不先做)。

## 4. 与现有能力衔接

- **规则**:`when`/校验可引用派生属性(`field('总负载') > field('带宽')` → BLOCK)。带宽约束即"派生(总负载)+ 规则(≤带宽)"组合。
- **视图**:`/views/object-types` 与对象视图把派生属性当只读列暴露(承 gen-c 有效字段集)。
- **SysML S4 参数化**:«constraint» block + parametric = 派生表达式的 profile 化用法。
- **Modelica**:方程是 acausal(双向)——派生是单向(causal);Modelica 完整支持需在本层上再加约束求解(更后),本层先覆盖 causal 派生。

## 5. 红线

- AG-105:派生只读、不落主数据;求值器纯、无 IO、无写句柄;数据上下文只读。
- AG-202/203:遍历/结果有界分页;AG-504:无 sleep、步数上限。
- AG-301/501:`DefineDerivedField` + 表达式扩展需契约 addendum(人发起)。
- 依赖方向:表达式引擎在 `engines/rules`(纯);派生定义在 kernel M2(field_def 扩列);求值编排在 server(读数据 + 调引擎),**kernel 不依赖 engines**(承 RuleChecker SPI 模式,必要时加 `DerivedEvaluator` SPI)。

## 6. 拆卡(逐卡封闭、串行、充分覆盖)

| 卡 | 范围 |
|---|---|
| **der-spec**(人发起) | meta-commands 加 `DefineDerivedField`;field_def 派生列的契约;表达式语法附录(traverse/聚合/算术/条件/嵌套);错误码(DERIVE-400 语法、DERIVE-409 依赖环、DERIVE-422 求值上限) |
| **der-a 表达式引擎** | `engines/rules` 扩:路径遍历(单跳+多跳有界)+ 聚合算子全集 + 算术/条件 + 字段引用解析;纯;单测(深/宽/环/上限/确定性) |
| **der-b 派生 M2** | 迁移:field_def 加 derivation/is_derived;`DefineDerivedField` handler + 依赖 DAG 环检测(定义期);随模板复制/演化(承批2) |
| **der-c 求值编排** | server `DerivedEvaluator`:构建只读数据上下文(多跳关联读,有界)→ 调引擎按依赖序算;接入视图(只读列)+ 规则(可引用派生);集成测试 |
| (der-d 缓存/性能) | 大图缓存/增量——后置,按需 |

## 7. 验收(由"简化总线"profile 充分验证,见后续卡)

总线 profile 定义:链路/消息/信号/节点 + 分配关系 + 派生(链路.总负载=sum over carries.load)+ 规则(总负载≤带宽);导入一组总线设计 → 派生算出负载 → 规则判超带宽 → 视图显示负载/余量。**端到端证明"可配置链式聚合计算 + 约束"在平台上成立**——这层一旦稳,SysML 参数化、Modelica causal 派生、总线时序/余度都顺势可建。
