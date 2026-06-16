# T-V33-RULE-3A — 规则 DSL 求值器(纯引擎)

蓝本:`docs/14` §2/§3、`contracts/规则命令契约.md`。**纯库,零 DB、零 Spring**,与 output/exchange/sim 同型(亦为阶段8 BL-01 第 4 个解释器)。可与 gen-c 并行(文件集互斥)。

## 目标

实现规则 `when` 布尔表达式的**解析 + AST + 沙箱求值 + 函数白名单**,供后续热/冷路径调用。本卡**只做纯求值,不接 DB、不接命令**(集成在 rule-3c/3d)。

## 封闭文件清单

- `packages/engines/src/main/java/com/mnext/engines/rules/`(新包):
  - `RuleExpression`(密封接口)+ AST 节点:`Literal`、`FieldRef`、`Comparison`、`Logical`、`Not`、`FunctionCall`;
  - `RuleParser`(手写递归下降:字符串→AST;语法错误抛 `RuleSyntaxException`);
  - `RuleEvaluator`(AST + `EvalContext` → boolean;沙箱;深度/步数上限,超限抛 `RuleEvalLimitException`);
  - `EvalContext`(只读接口:`fieldValue(code)`、有界 `relationCount(type)`/`hasRelation(type)`,由调用方注入);
  - `RuleFunctions`(白名单:`isBlank/length/matches/toNumber/inSet/coalesce/relationCount/hasRelation`);
  - 域异常 `RuleSyntaxException`、`RuleEvalLimitException`(纯,不带 HTTP/错误码——映射在 rule-3c)。
- `packages/engines/src/test/java/com/mnext/engines/rules/RuleEvaluatorTest.java`(+ 必要时 ParserTest)。

**零碰**:kernel、server、views、web、迁移、contracts、其它 engines 子包。**无新依赖**(AG-502)——手写解析器,不引 ANTLR;`matches` 用 `java.util.regex` 但**对输入与 pattern 设长度上限**防 ReDoS。

## DSL 封闭语法(与契约一致)

- 字面量(数/串/布尔/null)、`field('code')`、比较 `== != < <= > >=`、逻辑 `&& || !`、括号。
- **禁**:赋值、循环、lambda、成员/反射访问、`eval`、未知函数名(解析期即拒)。
- 函数白名单(封闭):标量 `isBlank/length/matches/toNumber/inSet/coalesce`;关系(有界)`relationCount('type')/hasRelation('type')`——经 EvalContext 只读取数,带调用上限。

## 红线 / 必测

- **沙箱逃逸**:未知函数名、反射式串、超长/嵌套表达式、危险正则 → 一律解析期拒或求值期安全降级(抛 `RuleEvalLimit`),**绝不触达任何 IO/写路径**(求值器不持写句柄、不发 IO,EvalContext 只读)。
- **可终止**:AST 深度上限 + 单次求值步数硬上限;超限抛 `RuleEvalLimitException`。
- **确定性**:同 AST + 同上下文 → 同结果。
- **纯度**:`engines/rules` 不 import spring/jdbc(架构断言 + grep)。
- 用例覆盖:合法解析与求值(真/假)、各比较与逻辑、`field` 缺值、关系函数有界、语法错误、未知函数、深度/步数超限、正则 ReDoS 被长度上限挡下。

## 门禁

`pnpm verify` 全绿(architecture/lint/typecheck/test/build)+ jacoco ≥0.80。落盘防截断自检(Java 括号/语句完整)。每步一 commit,完成后停,先发我 `git diff --stat main` + verify 结尾。
