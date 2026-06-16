# T-V33-GEN-B — 字段重定义(协变收紧)

蓝本:`docs/15` §3。前置:**gen-core 已合**(继承地基 + 两条 resolver)。单分支串行。

## 目标

子类型对继承字段做 redefine:`field_def.redefines_field_def_id` + `DefineFieldDef` 的 `redefinesFieldCode`,触发**协变收紧一致性**校验;`resolveEffectiveFields` 让子的重定义覆盖父同 code 字段。

## 封闭文件清单

- 迁移:`packages/kernel/.../V<next>__field_redefinition.sql`(`field_def.redefines_field_def_id`)。
- `DefineFieldDefHandler.java`:`redefinesFieldCode` → 定位祖先链同 code 父字段 → 协变一致性校验。
- `MetaModelRepository.java`:`resolveEffectiveFields` 合并时令子重定义覆盖父(若 gen-core 已实现覆盖语义,这里仅补"重定义指针校验")。
- 一致性校验逻辑(纯函数,kernel/internal)。
- 测试:重定义收紧/放宽矩阵单测 + 集成测试。

零碰:gen-core 之外的文件、批1–3、views/web/engines、contracts。

## 协变收紧矩阵(放宽即 `META-422-REDEFINITION-INCONSISTENT`)

值类型→同类或子孙;`required` false→true;`maxLength`↓;`minLength`↑;`min`↑/`max`↓;`enumValues` 取子集;`refObjectTypeCode`→原类型子类型。逐维判定,details 返回违例维度+父基准。

## 红线 / 门禁

AG-105 纯读校验;AG-405 不重写 FieldValidator;published 冻结;落盘防截断自检;`pnpm verify` 全绿 + jacoco ≥0.80;`git diff --stat` 自查封闭。集成测试 Docker 起、Skipped:0。
