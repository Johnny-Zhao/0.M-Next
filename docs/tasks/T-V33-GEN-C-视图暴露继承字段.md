# T-V33-GEN-C — 视图暴露有效(继承)字段

蓝本:`docs/15` §4/§8。**纯读侧 + 前端**,与 rule-3a(engines/rules)文件集互斥,可并行。前置:gen-core/gen-b 已在 main。

## 目标

`/views/object-types` 现在只返回类型自有字段;改为返回**有效字段集**——沿 `object_type.parent_type_id` 继承父字段、子类型重定义覆盖父、字段值类型折算为根原语+合并约束。前端表格/详情面板据此自动显示继承列。

## 封闭文件清单

- `packages/server/src/main/java/com/mnext/server/ReadModelRepository.java`:object-types 查询改为**递归 CTE** 解析有效字段(类型链 + field_def,子同 code 覆盖父;值类型经 value_type 链折算 base_primitive + 合并约束)。读侧独立查询,**只读**(CQRS 读模型,AG-101/102)。
- `packages/server/src/main/java/com/mnext/server/ViewQueryController.java`:若 DTO 字段有增(如标注 inherited/redefined、值类型名)则同步;否则不动。
- `packages/views/src/...`(表格/详情用到 objectType.fields 处):继承列自然显示;可加"继承/重定义"轻标注。
- `packages/web/src/...`:若有列渲染处同步。
- 测试:`packages/server/src/test/...ViewQuery*` 或读模型集成测试。

**零碰**:kernel(复用其语义但读侧自算,不调 kernel 包私有方法)、engines、迁移、contracts、命令侧。

## 语义(与 kernel resolveEffectiveFields 对齐)

- 子类型有效字段 = 祖先链所有 field_def 合并,子同 `code` 覆盖父(取最派生);
- 字段类型:有 `value_type_id` 则沿 `parent_value_type_id` 链合并约束、取 `base_primitive` 作 dataType;否则用 field 自身 `data_type`;
- 与命令侧 CreateObject 的 `resolveEffectiveFields` 行为一致(同样的覆盖/折算规则),避免"能建却不显示/显示却建不了"。

## 红线 / 门禁

- AG-101/102:视图只读、零主数据副本;查询有界(AG-202/203)。
- 读侧 CTE 与 kernel 写侧语义须一致(测试用同一继承样例对照)。
- 测试:子类型 object-types 返回继承字段;重定义字段显示子的(收紧)定义;值类型字段显示折算后的根原语+约束。
- `pnpm verify` 全绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成发我 `git diff --stat main` + verify 结尾。
