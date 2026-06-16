# 阶段2+ 设计稿 — M2 泛化(Generalization)与重定义(Redefinition)

状态:**设计稿(待用户确认)**。规则 DSL(docs/14)的前置底座。只做定义,不写实现代码。

## 0. 现状与缺口

stage 2(docs/04)已落地:`object_type`/`field_def`(已类型化:`data_type`+`constraints`)/`relation_type`、`scene_template(_version)`、`Define{ObjectType,FieldDef,RelationType}` 经 `/meta-commands`、`FieldValidator`(读"有效字段集"做校验)。

**两处都是扁平的、缺继承**:

1. **对象类型扁平**:`object_type` 无 `parent_type_id`——`性能需求` 无法"是一种 `需求`"并继承其字段。
2. **值类型扁平**:`data_type` 是固定清单(文本/数值/整数/日期/枚举/引用/JSON…),系统**不知道"自然段是一种文本"**——字段类型无法特化为子类型。
3. 有效特征集不沿任何继承链合并。

本设计**纯增量**,引入**两条同型的继承线**,机制完全一致。

## 1. 两条继承线(UML/MOF 对齐,B 级)

**机制相同**:都是"父→子单继承 + 子可重定义(只能更严)+ 沿链解析有效集 + 发布即冻结 + 环检测"。

### 线 A:对象类型泛化

```
需求 (name:文本必填, 优先级:枚举, 负责人:文本)
  └── 性能需求          ← 继承上面三个字段,自己再加 指标值
        name 收紧到≤50  ← 重定义继承来的 name(见线B类型也可换)
```

子类型继承父的:**字段定义、可参与的关系类型、(规则阶段起)规则**;并具**替换性(IS-A)**——凡接受"需求"处(`ref=需求`、关系端点=需求)均可放"性能需求"对象。

### 线 B:值类型泛化(本次新增,你提出的"文本→自然段")

**值类型是一等 M2 实体**,可像对象类型一样用命令定义、可继承、可再生子类:

```
文本(内置根)
  ├── 短文本   = 文本 + maxLength=50
  ├── 自然段   = 文本 + 多行/允许换行
  └── 富文本   = 文本 + 允许标记
数值(内置根)
  └── 整数 └── 正整数 = 整数 + min=1
```

- **内置根**(种子,不可删):文本/长文本、数值/整数、布尔、日期、日期时间、枚举、引用、JSON——对应现有 `data_type` 封闭集,作为各继承树的根。
- **用户自定义子类型**:`自然段 = 文本 + 约束`,可跨字段复用、可再派生。
- 子值类型 = 父值类型 + **更严约束**(同样只能收紧)。

一个 `field_def` 的"类型"= 引用某个值类型(内置根或自定义子类)。

## 2. 数据结构(迁移 `V9__metamodel_generalization.sql`,增量;以仓库实测 max 为准)

```
-- 线A:对象类型泛化
ALTER TABLE object_type
  ADD COLUMN parent_type_id UUID NULL REFERENCES object_type(id);
  -- 父子须同 workspace、同 template_version_id;parent 链不得成环

-- 线B:值类型一等实体 + 自身泛化
CREATE TABLE value_type (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  template_version_id UUID NULL REFERENCES scene_template_version(id),
  code TEXT NOT NULL,                 -- 同空间唯一(含内置根)
  name TEXT NOT NULL,
  base_primitive TEXT NOT NULL,       -- 所属根原语(string/text/number/integer/…),沿链恒定
  parent_value_type_id UUID NULL REFERENCES value_type(id),  -- NULL=根
  constraints JSONB NOT NULL DEFAULT '{}',  -- 本层新增/收紧的约束
  published BOOLEAN NOT NULL DEFAULT FALSE,
  version BIGINT NOT NULL DEFAULT 1,
  UNIQUE (workspace_id, code)
);

-- field_def 改为引用值类型(保留 data_type 作为解析出的根原语缓存,FieldValidator 不改)
ALTER TABLE field_def
  ADD COLUMN value_type_id UUID NULL REFERENCES value_type(id),
  ADD COLUMN redefines_field_def_id UUID NULL REFERENCES field_def(id);
```

约束:`value_type` 子类的 `base_primitive` 必须与父一致(自然段的根永远是 text);`parent_value_type_id` 链不得成环;`redefines_field_def_id` 指向的父字段须在本类型祖先链上、同 `code`。

## 3. 重定义一致性(协变收紧,Covariant Narrowing)

子类型 redefine 父字段时,逐项判"是否更严";放宽即 `META-422-REDEFINITION-INCONSISTENT`。**类型本身也可变,但只能换成子值类型**:

| 维度 | 允许(更严/更具体) | 拒绝(放宽) |
| --- | --- | --- |
| **值类型** | 换成父字段值类型的**同类或子孙**(文本→自然段 ✅) | 换成父值类型/兄弟/无关(自然段→文本 ❌,文本→数值 ❌) |
| `required` | `false→true` | `true→false` |
| `maxLength` | 只能 ↓ | ↑ |
| `minLength` | 只能 ↑ | ↓ |
| `min` / `max` | 区间只能收窄 | 放宽 |
| `enumValues` | 只能取**子集** | 超集/新增 |
| `refObjectTypeCode` | 只能改为原对象类型的**子类型**(线A 协变) | 父/无关类型 |

值类型的"是不是子孙"沿 `parent_value_type_id` 链判定——与对象类型的子孙判定同一套逻辑。

## 4. 有效解析(Effective Resolution)——核心挂点,下游零改

两个纯函数解析器(`MetaModelRepository`),只读、纯函数:

1. **`resolveEffectiveValueType(valueTypeId)`**:沿 `parent_value_type_id` 向上,合并各层 `constraints`(子层收紧覆盖),得到 `{base_primitive, 合并后约束}`。
2. **`resolveEffectiveFields(objectTypeId)`**:沿 `parent_type_id` 向上收集 `field_def`,子类型同 `code` 覆盖父(redefine 生效),每个字段的类型再经 ①解析为 `{dataType=base_primitive, constraints}`。

产出的 `Map<code, FieldDefinition>` 喂给**现有 `FieldValidator`**(它仍只认 `DataType` 枚举 + 约束,**逻辑一行不改**)。值类型的"名字/层级"对 FieldValidator 透明——解析层已把自然段折算成"文本 + 多行约束"。

下游全部复用这两个解析器:CreateObject/UpdateFields 校验(含继承+重定义字段)、ref/关系端点 IS-A 判定、视图列、规则 scope、SysML 泛化映射。

**环检测**:`DefineObjectType`/`DefineValueType` 时若新父链可达自身 → `META-422-GENERALIZATION-CYCLE`;解析设深度上限兜底。

## 5. 命令与契约 addendum(需人发起 spec-change,AG-301/501)

| 命令 | 改动 | 关键校验 |
| --- | --- | --- |
| `DefineObjectType` | 增可选 `parentTypeCode` | 父存在、同模板版本、不成环 |
| `DefineValueType`(**新**) | 定义/改值类型:`code/name/parentValueTypeCode?/constraints` | 父存在且同根原语、不成环、约束相对父只收紧;发布不可变 |
| `DefineFieldDef` | 字段类型由 `valueTypeCode` 指定;增可选 `redefinesFieldCode` | 值类型存在;重定义触发 §3 协变校验 |

新错误码(`error-codes.yaml` 追加;前缀 `META-` 与 KERNEL/REVIEW/SIM 并列,审查时定):

| code | http | 含义 |
| --- | --- | --- |
| META-422-PARENT-NOT-FOUND | 422 | 父类型/父值类型不存在 |
| META-422-PARENT-CROSS-TEMPLATE | 422 | 父子不同模板版本/空间 |
| META-422-GENERALIZATION-CYCLE | 422 | 继承成环(对象类型或值类型) |
| META-422-VALUETYPE-BASE-MISMATCH | 422 | 子值类型根原语与父不一致(如自然段的根不是 text) |
| META-422-REDEFINITION-INCONSISTENT | 422 | 字段重定义放宽了类型/约束(返回违例维度) |
| META-409-PUBLISHED-IMMUTABLE | 409 | 对已发布版本改继承/值类型/重定义(可复用既有 TEMPLATE-VERSION-IMMUTABLE) |

契约:改 `contracts/元模型命令契约.md` + `schemas/meta-commands.schema.json` + `fixtures`(反例至少:成环、跨模板父、根原语不符、重定义放宽 maxLength、值类型放宽回父)。

## 6. 演化兼容(承 docs/04 §5 两档)

`ApplyTemplateVersion` 比对时,继承/值类型变更并入判级:

- **新增兼容**:新增子类型/子值类型、重定义进一步收紧、值类型换更具体子类(对存量实例无新违反)。
- **收紧阻断**:改/去父、把父级字段或值类型改严导致存量实例违反 → `KERNEL-409-TEMPLATE-MIGRATION-REQUIRED` + 受影响实例清单。

三方合并/自动迁移仍属 BL-05,禁实现。

## 7. 红线与审查清单

- **AG-405 最小侵入**:不重写 `FieldValidator` 与批1–3 处理器;只(a)给 `DefineObjectType` 加父参、(b)新增 `DefineValueType`、(c)`DefineFieldDef` 用 `valueTypeCode`+重定义校验、(d)新增两个解析器并在构建 definitions 处调用。
- **AG-109/201**:类型/值类型授权不跑重任务、事务内零出站;解析器纯函数。
- **AG-105**:一致性校验、有效解析**只读**,不写主数据。
- **发布不可变**:published 版本的继承、值类型、重定义全冻结。
- **必测**:对象类型环 / 值类型环 / 跨模板父拒绝 / 根原语不符 / 各维度协变收紧矩阵(含"换子值类型"通过、"换回父值类型"拒绝)/ 继承+重定义字段在 CreateObject 被校验 / 子类型实例满足父 ref(IS-A)。
- 跨 workspace/模板父引用禁止;**多继承不实现**(单 `parent_*_id`)。

## 8. 拆卡建议(逐卡封闭清单、逐卡 `pnpm verify`、串行合并)

| 卡 | 范围(封闭清单要点) | 依赖 |
| --- | --- | --- |
| **gen-spec**(人发起) | 契约 addendum:meta-commands 加 `parentTypeCode`、`DefineValueType`、`valueTypeCode`/`redefinesFieldCode` + META-422 错误码 + fixtures + AGENTS AG-311 前缀 | 无 |
| **gen-vt 值类型** | 迁移:`value_type` 表 + 内置根种子 + `field_def.value_type_id`;`DefineValueType`(父/根原语/收紧/环校验)+ `resolveEffectiveValueType`;`DefineFieldDef` 改用 `valueTypeCode`;集成测试(自然段=文本+约束,校验生效) | gen-spec |
| **gen-a 对象泛化** | 迁移:`object_type.parent_type_id`;`DefineObjectType` 扩父 + 环/跨模板校验 + `resolveEffectiveFields`(沿链合并)+ definitions 构建点改调它;集成测试(继承必填字段被校验、IS-A ref) | gen-spec |
| **gen-b 重定义** | 迁移:`field_def.redefines_field_def_id`;`DefineFieldDef` 协变一致性(含**值类型换子类**)+ META-422;单测(收紧/放宽矩阵) | gen-vt,gen-a |
| **gen-c 视图暴露**(可选) | 读模型/查询端点暴露 effective fields + 值类型名;纯 views/web 或查询端 | gen-a |
| **gen-d 兼容判级**(可后置) | `ApplyTemplateVersion` 纳入继承/值类型/重定义变更两档判级 | gen-vt,gen-a,gen-b |

顺序建议:`gen-spec` →(`gen-vt` ‖ `gen-a` 文件集基本不相交,可并行)→ `gen-b`(依赖前两者)→(`gen-c`/`gen-d` 后置)。

## 9. 与规则 DSL(docs/14)的衔接

- 规则 `scope` 解析复用 `resolveEffectiveFields` 的子孙闭包:supertype 规则适用 subtype 实例。
- `rule_def` 加 `redefines_rule_def_id`,子类型同 `code` 规则 shadow 父规则(与字段重定义同型)。
- 规则迁移号顺延到本阶段之后(`V10+`);docs/14 的"V9/V10"相应改为更后的空闲号(以实测 max 为准)。

## 10. 验收口径

定义值类型 `自然段=文本+多行`;定义对象类型 `需求`(`name:文本` 必填)与 `性能需求`(parent=需求)并把 `name` 重定义为 `自然段`、新增必填 `指标`;在该空间 `CreateObject(性能需求)`:缺 `name`/`指标` 被 `KERNEL-422` 拒绝(继承+重定义均生效);`name` 写单行普通文本仍可(自然段是文本的子类、约束更宽松项不冲突),写违反自然段约束的值被拒;`ref=需求` 字段接受 `性能需求` 对象(IS-A);把 `name` 值类型从自然段改回文本被 `META-422-REDEFINITION-INCONSISTENT` 拒绝;制造对象类型环或值类型环被 `META-422-GENERALIZATION-CYCLE` 拒绝;对已发布版本改这些被 `409`。
