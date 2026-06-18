# T-V33-INTERP — 派生/规则 DSL 查表与插值函数(lookup / interp)

蓝本:`contracts/元模型命令契约.md` 表达式语法附录"查表/插值"(interp-spec addendum,长板3)。前置:该 addendum + fixture 在分支基线。**纯 engines/rules**(求值器是纯函数,落 engines,与 kernel←engines 方向一致)。**与 fed-3 零文件冲突**(fed-3 只动 server 测试)。

## 范围

在规则/派生求值器的白名单函数集里**新增两个变参函数**,复用现有 `FunctionCall` 机制——**不加新 AST 节点、不加数组字面量、不加实体/命令/迁移/错误码**。

- `interp(key, x1,y1, x2,y2, …, xn,yn)`:**线性插值**。在 `[xi, xi+1]` 区间内线性内插。
- `lookup(key, x1,y1, …, xn,yn)`:**分段常数(阶梯)**,返回最大 `xi ≤ key` 对应的 `yi`。
- **语义**:
  - 参数个数为**奇数**(1 个 key + 偶数个表项);断点对数 `n ≥ 1`;`x` **严格递增**。
  - **越界钳到端点**:`key < x1 → y1`;`key > xn → yn`(工程安全,不报错)。
  - `n == 1`(单点)时两者都恒返回 `y1`。
  - 入参经 `toNumber` 归一;任一无法转数→按现有数值函数惯例(返回 null / 评估失败,与 `toNumber` 一致)。
  - **表畸形**(参数个数为偶/不足一对/`x` 非严格递增)→抛 `RuleSyntaxException`(server 映射 `DERIVE-400-SYNTAX-INVALID`)。

## 封闭文件清单

**修改**
- `packages/engines/src/main/java/com/mnext/engines/rules/RuleFunctions.java`:
  - `ALLOWED` 集合加 `"interp"`、`"lookup"`(parser 经 `isAllowed` 即放行,见 RuleParser:121)。
  - `invoke` switch 加两个 case → 私有实现 `interp(args)` / `lookup(args)`(变参:args[0]=key,args[1..]=表项);含畸形校验(抛 `RuleSyntaxException`)与端点钳制。
  - 复用既有 `toNumber`、`stringArg` 等助手;返回 `BigDecimal`。

**修改(测试)**
- `packages/engines/src/test/java/com/mnext/engines/rules/RuleEvaluatorTest.java`:加用例——
  - interp 区间内插值正确(如 `interp(40, -20,1.05, 25,1.0, 60,0.92)` 落在 25..60 段);
  - interp/lookup 端点钳制(key<x1、key>xn);
  - lookup 阶梯取值(取 `xi ≤ key` 的最大段);
  - 单点表恒返回;
  - 畸形表(偶数参 / 非递增 x)抛 `RuleSyntaxException`;
  - 经 `RuleParser.parse` + `RuleEvaluator.evaluateValue` 端到端(确认 parser 放行新函数)。

**零碰**:kernel、server、views/web、contracts(addendum/fixture 已在基线)、迁移、其它 engines 文件(除非 parser 确需,但 isAllowed 机制下应不需要——若需改 RuleParser,停下说明再动)。

## 红线 / 门禁

- 纯函数、无副作用、无 I/O;不读数据上下文(interp/lookup 只算字面量表 + key)。
- 不新增错误码(复用 `DERIVE-400-SYNTAX-INVALID`)、不新增 AST 节点、不改命令 schema。
- `pnpm verify` 全绿 + jacoco ≥0.80。engines 为纯单测,无需 Docker;但仍确认 engines 测试汇总 `Skipped:0`。
- AG-405 落盘防截断自检。完成发 `git diff --stat <基线>`(应仅 RuleFunctions.java + RuleEvaluatorTest.java)+ engines 测试汇总。

## 验收
- 上述测试用例全过;interp/lookup 行为与契约 addendum 一致(线性/阶梯/钳制/畸形报错)。

## 用途回链
解锁能源 profile 的 DOD-循环次数(`lookup`)与温度/辐照衰减曲线(`interp`),把可行性备忘"长板3"落地;阶段 A 中原作输入的衰减/DOD 字段可改为 `interp/lookup` 派生。
