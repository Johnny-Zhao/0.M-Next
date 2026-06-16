# T-V33-RULE-3C — 热路径规则预检(RuleChecker SPI)

蓝本:`docs/14` §4、`contracts/规则命令契约.md`。前置:rule-3a(求值器)、rule-3b(rule_def)在 main。**串行**(碰 kernel SPI 注入点 + server)。

## 架构(镜像 PermissionChecker)

- **`kernel.api.RuleChecker`**(新接口):`List<RuleViolation> check(UUID workspaceId, UUID objectTypeId, Map<String,Object> effectiveFieldValues, Actor actor)`;`RuleViolation`(kernel.api record:ruleCode/severity/message)。
- **`kernel.internal.NoOpRuleChecker`**(默认实现,返回空)——保证 kernel 单测与无规则场景不受影响。
- **接入点**:`CreateObjectHandler`、`UpdateFieldsHandler` 在 `FieldValidator.validate` 之后、持久化之前调 `ruleChecker.check(...)`;任一 `BLOCK` → 抛 `CommandErrors.ruleViolation(violations)`(code=`RULE-422-RULE-VIOLATION`,details 带命中规则清单),**事务回滚、不写、不 outbox**(AG-201)。`WARN/INFO` 不阻断(MVP 可记录,不强求回带)。
- **`server` 的 `EnginesRuleChecker implements RuleChecker`**(@Primary bean,覆盖 NoOp):
  - 载**适用规则** = published 且 lightweight 且 `scope_object_type_id ∈ {该类型及其所有祖先}`(supertype 规则适用 subtype 实例;用 ancestor CTE);若有 scope_field_def_id,仅当该字段在本次有效字段内才评。
  - 每条:`engines/rules.RuleParser.parse(when_src)` → `RuleEvaluator.evaluate(ast, ctx)`;`ctx` = 只读 EvalContext(fieldValue 来自传入的 effectiveFieldValues;relationCount/hasRelation 经有界读 rm_relation/data_relation)。
  - `when` 求值为 true = 命中违例 → 收集 `RuleViolation(ruleCode, severity, message)`(message 做 `${field('code')}` 只读插值)。

## 封闭文件清单

- `packages/kernel/src/main/java/com/mnext/kernel/api/RuleChecker.java`、`.../api/RuleViolation.java`;`.../internal/NoOpRuleChecker.java`;`CommandErrors.java`(加 `ruleViolation(...)` 工厂,code=RULE-422-RULE-VIOLATION);`CreateObjectHandler.java`/`UpdateFieldsHandler.java`(各加一处 ruleChecker 调用 + 构造注入 RuleChecker)。
- `packages/server/src/main/java/com/mnext/server/EnginesRuleChecker.java`(@Primary)+ 必要的读 rule_def/relation 的小仓储或复用既有;`CommandErrorHandler` 若未覆盖 RULE-422 则确保其经 code→HTTP 映射到 422。
- 测试:kernel `CreateObjectHandlerTest`/`UpdateFieldsHandlerTest`(注入 mock RuleChecker,BLOCK→拒、空→放行);server 集成测试(DefineRule BLOCK → 违例对象 CreateObject 被 RULE-422 拒且无写;WARN 放行;非 lightweight 不进热路径;子类型实例命中父类型规则)。

**零碰**:engines(只调用,不改)、views/web、迁移、contracts、批2/3 处理器逻辑(只加预检调用一行)、Simulation*。

## 红线 / 8.5

- **8.5**:仅评"被改对象类型(及祖先 scope)+ lightweight" 规则,对**单对象**求值;**绝不全表扫描、绝不评 lightweight=false**。
- **AG-201**:BLOCK 在写入前抛出,无事务外副作用、无 outbox。
- **AG-105**:RuleChecker/求值只读,不写主数据;EvalContext 只读。
- **AG-405**:不重写 FieldValidator 与处理器主体,只加 ruleChecker 调用 + 构造参数。
- 依赖方向:`RuleChecker` 在 kernel.api,impl 在 server 注入,**kernel 不依赖 engines**。

## 门禁

`pnpm verify` 全绿 + `contracts:check` 绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,先发 `git diff --stat main` + verify 结尾。
