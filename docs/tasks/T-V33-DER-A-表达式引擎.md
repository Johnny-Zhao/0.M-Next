# T-V33-DER-A — 派生表达式引擎(engines/rules 扩展,纯)

蓝本:`docs/18` §1/§3、`contracts/元模型命令契约.md` 派生 addendum 的表达式语法附录。前置:der-spec 在 main。**纯库**(engines/rules),无 DB/Spring/新依赖。前置规则求值器(rule-3a)已在。

## 目标

在现有规则求值器之上,加**路径遍历 + 聚合 + 算术 + 条件**,支撑派生表达式求值。本卡**只做纯求值**,不接 DB、不接命令、不做依赖图(那是 der-b/c)。

## 新增表达式(封闭集,与契约附录一致)

- **遍历**:`traverse('relTypeCode','out'|'in')`(从当前对象单跳→关联对象集);`traverseFrom(set,'relTypeCode',dir)`(从集合再跳,**链式**);`traverseDeep('relTypeCode',dir,maxDepth)`(同型关系**多跳传递闭包**,maxDepth 有硬上限)。
- **聚合**(over 集合):`sum(set,'field')`、`avg(set,'field')`、`max(set,'field')`、`min(set,'field')`、`count(set)`、`any(set, 谓词)`、`all(set, 谓词)`。
- **算术/条件**:`+ - * /`、`if(cond,a,b)`。
- **引用**:`field('code')`(经 EvalContext;指 stored 或派生对求值器透明)。
- 与现有标量/比较/逻辑/白名单函数共存,**现有规则表达式行为不变**。

## EvalContext 扩展(关键:default 方法,不破既有实现)

`EvalContext` 加 **default** 方法:`default Iterable<EvalContext> traverse(String relType, String dir){ return List.of(); }`(及 traverseDeep 所需)。默认空集 → server 既有实现(RuleChecker/RuleCheckRunner 的匿名 EvalContext)**零改动**;真实遍历由 der-c 覆盖。遍历返回的每个关联对象 = 一个子 `EvalContext`(可再读其 field、再遍历)。

## 有界与可终止(必须)

- `traverseDeep` 深度 ≤ maxDepth 且 ≤ 硬上限(如 32);
- 单次求值**总访问节点数**上限、**步数**上限(承 RuleEvaluator 现有 step 机制);
- 超任一上限 → 抛 `RuleEvalLimitException`(引擎级;映射 DERIVE-422 在 der-c);
- 纯函数、无 IO、无写句柄、确定。

## 封闭文件清单

- `packages/engines/src/main/java/com/mnext/engines/rules/`:扩 `RuleParser`(新函数/词法)、`RuleEvaluator`(集合/聚合/算术/条件求值 + 遍历上限)、`EvalContext`(default 遍历方法)、新增 AST 节点(Traverse/Aggregate/Arithmetic/Conditional 等)。
- `packages/engines/src/test/java/com/mnext/engines/rules/`:`DerivationEvaluatorTest`(用内存 EvalContext 造图)。

零碰:kernel、server(EvalContext default 保证不破其实现)、views/web、迁移、contracts。**无新依赖**(手写扩 parser)。

## 必测

- traverse 单跳 + sum/count;`traverseFrom` 链式(链路→消息→信号);`traverseDeep` 传递闭包(树形质量汇总);每个聚合算子;算术 + if;嵌套(聚合结果再参与算术);
- 上限:超深 traverseDeep、超宽集合、超步数 → `RuleEvalLimitException`;
- 确定性;**向后兼容**(rule-3a 既有规则表达式全部仍解析/求值通过);
- engines/rules 纯净(无 spring/jdbc/io,架构断言)。

## 门禁

`pnpm verify` 全绿 + jacoco ≥0.80。落盘防截断自检。完成停,发 `git diff --stat main` + verify 结尾。
