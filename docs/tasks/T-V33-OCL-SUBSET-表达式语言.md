# T-V33-OCL-SUBSET — OCL 受限子集表达式语言(横切)

蓝本:`docs/评估-OMG标准对平台的借鉴.md` 横切轨道。**packages/engines(rules)为主 + manifest 解析。** 前置:main(现有 RuleParser/RuleExpression/RuleEvaluator/EvalContext + DerivedEvaluator)。
定位:把规则 `when`、派生 `derivation`、(后续)映射条件统一成**受 OCL 启发的受限子集**,替掉自研 DSL;**AST 为稳定 IR,加 OCL 前端 + 静态类型检查,求值器基本不动,按 manifest 渐进迁移**。独立横切,不阻塞阶段一/二。

## 现状(已核实)
- `RuleParser`:递归下降(or→and→unary→comparison→additive→multiplicative→primary)。
- `RuleExpression`:密封 AST(Literal/FieldRef/Comparison/Logical/Not/FunctionCall/Traverse/TraverseFrom/TraverseDeep/Aggregate/Arithmetic/Conditional)。
- `EvalContext`:fieldValue/relationCount/hasRelation/traverse/traverseDeep,求值与存储解耦。
- 规则与派生共用引擎;有长度上限、求值上限(RuleEvalLimitException)、依赖成环检测。

## 范围(渐进、加性)
- **A. 共享 AST 补节点**:补 OCL 迭代算子节点 + 求值分支——`->select/reject/collect/forAll/exists/isEmpty/size/sum/includes`(均经 EvalContext.traverse 迭代,**不碰存储**);按需补 `let`、if-then-else(现有 Conditional 可复用)。
- **B. OclParser**:新增解析器,产出**同一套 RuleExpression AST**。OCL 子集↔现节点映射:`self.x`↔FieldRef、`self.r`/`self.r->size()`↔Traverse/relationCount、`x.oclIsUndefined()`↔isBlank、集合算子↔A 的新节点。
- **C. 静态类型检查器 `ExpressionTypeChecker`**:用 profile 元模型(字段 dataType/valueType、关系端点类型)在**装载时**校验表达式类型;装载失败给清晰诊断。
- **D. manifest 选择语言**:表达式可选 `lang: "ocl" | "m-expr"`(缺省 m-expr,即现状)。新 profile 用 ocl;**室内/技术方案/MBSE 维持 m-expr 不动**。
- **E. 边界(不做)**:不做完整 OCL(tuple、message expr、完整标准库、oclAsType 边角);子集保持有界可判定,沿用现有求值/递归上限。

## 封闭文件清单
**修改/新增**:`packages/engines/.../rules/`(OclParser、AST 新节点、RuleEvaluator 求值分支、ExpressionTypeChecker)、manifest 解析加 `lang`、ProfileLoader 装载时调类型检查、相关单测/E2E。
**零碰**:EvalContext 语义边界(只加迭代默认实现)、DerivedEvaluator 主体(消费 AST)、读模型、前端、既有领域 manifest 内容。

## 红线 / 门禁
- **完全向后兼容**:`lang` 缺省即 m-expr,既有 manifest 一行不改、行为零变化。
- 子集**有界可判定、可静态校验**;沿用长度/求值/成环上限;**不向图灵完备扩展**。
- `corepack pnpm verify` 全绿(含规则/派生既有用例 + 新增 OCL 用例)。
- 分支 `feat/T-V33-ocl-subset` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main` + 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 同一规则/派生分别用 m-expr 与 ocl 写,求值结果一致(等价用例);集合算子(select/forAll/size 等)求值正确。
2. 类型不符的 OCL 表达式在装载时被类型检查拒绝并给诊断;有界上限仍生效。
3. 既有三领域(m-expr)零回归;verify 全绿。

## 跟进(本卡不做)
v1→OCL 转译器(AST→OCL 文本)批量迁移老表达式;映射条件(2b)切 OCL;停用 m-expr 解析器。
