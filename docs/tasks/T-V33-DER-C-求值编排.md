# T-V33-DER-C — 派生求值编排 + 规则引用 + 随模板复制(派生层闭环)

蓝本:`docs/18` §3/§4。前置:der-a(引擎)、der-b(derived_field)在 main。**server 域**。派生层闭环的功能核心(视图显示派生值=der-d 后置)。

## 范围(三件,功能闭环)

1. **DerivedEvaluator(server)**:给 `(workspace, objectId, derivedFieldCode)` 算出值——
   - 构**只读 read-model EvalContext**:`fieldValue(code)`=读 rm_object.fields;`traverse(relType,dir)`=查 rm_relation(source/target+relation_type_code)→关联 rm_object,各包成子 EvalContext(可再读 field、再 traverse);
   - `field('x')` 若 x 是**派生**字段 → 递归调 DerivedEvaluator 算(**依赖序 + 记忆化**;der-b 已保证无环);
   - 跑 engines `RuleEvaluator`(承其遍历/步数上限);纯只读、不写主数据(AG-105)。
2. **规则引用派生**:`EnginesRuleChecker`(热)+ `RuleCheckRunner`(冷)的 EvalContext 的 `fieldValue` 对**派生码**委派 DerivedEvaluator → 规则 `when` 可写 `field('total_load') > field('capacity')`。**带宽约束即此**。
3. **派生随模板复制**:实例化/演化时复制 `derived_field`(承 batch2-rules 模式,scope/objectType 按 **code 重解析**到目标空间)——新增 `DerivedFieldCopier`,接入 `TemplateLifecycleService.instantiate/apply`。

## 封闭文件清单

- `packages/server/src/main/java/com/mnext/server/`:`DerivedEvaluator`(+ read-model EvalContext 实现)、`DerivedFieldCopier`;改 `EnginesRuleChecker`/`RuleCheckRunner`(注入 DerivedEvaluator,fieldValue 解析派生)、`TemplateLifecycleService`(接 DerivedFieldCopier)、必要时 `DerivedFieldRepository`(查询用)。
- 复用 `engines/rules`(RuleParser/RuleEvaluator/EvalContext,不改)。
- 测试:server 集成——派生求值(单/嵌套/多跳,over read model)、**规则引用派生触发**(造链路+消息,total_load>capacity → BLOCK 拦)、派生随实例化复制(目标空间 derived_field scope 指新 id)。

零碰:kernel、engines(只调用)、views/web(派生显示=der-d)、contracts、迁移(derived_field 已在 der-b)。

## 求值递归与终止(关键)

派生引用派生(可能在被遍历对象上)→ EvalContext 与 DerivedEvaluator 互递归;**记忆化(同对象同派生码缓存本次求值内)** + der-b 无环保证 + 引擎遍历/步数上限 → 终止。超界 → `DERIVE-422-EVAL-LIMIT`(引擎 RuleEvalLimit 映射)。

## 红线 / 门禁

- AG-105:求值/遍历**只读** rm_*;派生不落主数据。AG-201:规则预检/冷路径行为不变(派生只读)。AG-202/203:遍历有界。
- 热路径仍仅 lightweight 规则、单对象(8.5);派生求值的遍历上限承引擎。
- `pnpm verify` 全绿 + jacoco ≥0.80;**集成测试 Docker 起、Skipped:0**(本卡核心全是集成测试,务必真跑)。落盘防截断自检。完成停,发 `git diff --stat main` + verify 的 server 测试汇总(Skipped 数)。

## 后续(der-d,后置)

视图暴露派生值:object-types 列出派生字段 + 对象详情按需算派生值显示(UI,承"UI 后置")。
