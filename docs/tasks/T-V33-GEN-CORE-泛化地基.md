# T-V33-GEN-CORE — 泛化地基(值类型 + 对象类型泛化)

蓝本:`docs/15`。前置:gen-spec 契约 addendum 已合(meta-commands schema v1.1 + META- 错误码)。**单分支串行**(与 gen-b 不并行——共用 kernel 元模型文件)。

## 目标(一张卡两条同型继承线的地基)

1. **值类型一等实体**:`value_type` 表 + 内置根种子 + `field_def.value_type_id`;`DefineValueType` 命令(父/根原语一致/环/协变收紧/发布不可变);`resolveEffectiveValueType`。
2. **对象类型泛化**:`object_type.parent_type_id`;`DefineObjectType` 加 `parentTypeCode`(父存在/同模板版本/环);`resolveEffectiveFields`(沿父链合并 field_def,子同 code 覆盖,字段类型经 ①折算)。
3. **DefineFieldDef** 接受 `valueTypeCode`(与 `dataType` 二选一,resolve 成根原语+约束)。
4. **接线**:构建喂给 `FieldValidator` 的 `definitions` 处改调 `resolveEffectiveFields`——**FieldValidator 逻辑一行不改**。
5. **IS-A**:ref / 关系端点类型匹配改为"目标类型 ∈ 期望类型子孙闭包"。

## 封闭文件清单(只准碰这些,越界判废)

- 迁移:`packages/kernel/src/main/resources/db/migration/V<next>__metamodel_generalization.sql`(以仓库实测 max 取下一个空闲号;含 `value_type` 表 + 内置根 seed + `object_type.parent_type_id` + `field_def.value_type_id`)。
- `packages/kernel/src/main/java/com/mnext/kernel/internal/`:新增 `DefineValueTypeHandler.java`;改 `DefineObjectTypeHandler.java`(父参+环/跨模板校验)、`DefineFieldDefHandler.java`(valueTypeCode 解析)、`MetaModelRepository.java`(`resolveEffectiveValueType`/`resolveEffectiveFields` + value_type 读写);**不改 `FieldValidator.java` 内部逻辑**(只改其调用方构建 definitions 的那处,若该处在 `KernelCommandServiceImpl`/相关仓储,允许动那一行)。
- `packages/kernel/src/main/java/com/mnext/kernel/api/`:若需新增 `DefineValueTypeCommand` 记录类。
- `packages/server/src/main/java/com/mnext/server/MetaCommandController.java`:注册 `DefineValueType` 路由(+ DefineObjectType 透传父参,若 DTO 在此)。
- 测试:`packages/kernel/src/test/...` 单测 + `packages/server/src/test/...MetaModel*IntegrationTest`。

**零碰**:批1–3 M1 命令处理器逻辑、data_object/data_relation 语义、views/web、engines、其它迁移、contracts(已由 gen-spec 固定)、`field_def.redefines_field_def_id`(属 gen-b)。

## 关键校验与错误码(用 gen-spec 已登记的码)

- 父不存在 `META-422-PARENT-NOT-FOUND`;父子跨模板/空间 `META-422-PARENT-CROSS-TEMPLATE`;继承成环(对象类型或值类型)`META-422-GENERALIZATION-CYCLE`;子值类型根原语≠父 `META-422-VALUETYPE-BASE-MISMATCH`;值类型约束相对父放宽 `META-422-REDEFINITION-INCONSISTENT`;published 版本下改 `META-409-PUBLISHED-IMMUTABLE`(或复用 `KERNEL-409-TEMPLATE-VERSION-IMMUTABLE`)。
- 内置根种子:`string/text/integer/number/boolean/date/datetime/enum/ref/json` 各建一条 `value_type`(parent=NULL,base_primitive=自身),published=true。

## 红线(审查清单)

- **AG-405 最小侵入**:不重写 FieldValidator 与批1–3;只加 handler/resolver + 调用点一行。
- **AG-105**:resolver 与一致性校验**只读纯函数**,不写主数据。
- **AG-109/201**:授权命令不跑重任务、事务内零出站。
- **环检测**:对象类型链、值类型链各自必测(自指、间接环)。
- **发布冻结**:published 版本改继承/值类型被拒。
- **单继承**:单 `parent_*_id`,多继承不实现。
- **落盘防截断自检**:每个 Java 文件类/方法括号配平,迁移 SQL 完整可执行;提交前 `git diff --stat` 自查只在封闭清单内。

## 测试要求(集成,Docker 起,Skipped:0)

- 定义 `value_type 自然段=文本+multiline+maxLength`;`DefineFieldDef(valueTypeCode=自然段)` 落地后 CreateObject 按"text+约束"校验生效。
- 定义 `需求`(name 必填)→ `性能需求`(parent=需求);CreateObject(性能需求) 缺继承字段 name 被 `KERNEL-422-FIELD-VALUE-INVALID` 拒。
- IS-A:`ref=需求` 字段接受 `性能需求` 对象。
- 反例:对象类型环 / 值类型环 / 跨模板父 / 子值类型根原语不符 / 值类型放宽约束 → 各自 META-422;published 下改 → 409。

## 门禁

`pnpm verify` 全绿(architecture/lint/typecheck/test/build)+ `contracts:check` 绿 + jacoco ≥0.80。每步一 commit,完成停等审查。
