# 04 — 阶段2 元模型(M2)设计稿

- 状态:设计稿(Claude 产出,待用户确认 → 转 Codex 任务卡 T-V33-201)
- 依据:说明书 4.7、F.3(M0–M3 分层,B 级)、契约 §3/§5;AGENTS.md AG-109/110/301/321/322;现状迁移 V1/V2
- 范围:对象类型 / 属性定义 / 关系类型的**授权(authoring)、类型化、发布、版本化、实例化、兼容校验**;对应 MVP-0 第 1/2/3 项
- 红线:AG-109 模板组不跑重任务;M2 授权不得绕过命令入口;不得改既有内核批1–3 代码

---

## 1. 现状与缺口

V1/V2 迁移已建 `object_type / field_def / relation_type` 三张 M2 表,但:

1. **无授权 API**:类型仅靠迁移 seed 注入,无法在运行期"创建对象类型/属性/关系类型"(MVP-0 第 1/2/3 项无法演示)。
2. **属性无类型**:`field_def` 仅 `code/name/required`,缺 `data_type` 与约束 → CreateObject/UpdateFields 只能校验必填,无法校验类型/范围/枚举。
3. **无版本与发布语义**:`object_type.published` 仅布尔,无模板分组、无版本号、无"发布即不可变"、无实例化绑定、无演化兼容校验(4.7"类型变更需兼容存量"未落)。

本设计**纯增量**:新增迁移 V3,扩列 + 新表 + 新命令面;**不动 data_object/data_relation 等 M1 表与批1–3 处理器代码**(类型校验以挂点方式注入)。

## 2. M0–M3 分层落点(F.3,B 级概念命名,不新建存储)

| 层 | 含义 | 平台载体 |
|---|---|---|
| M3 平台元元模型 | 类型系统本身(什么是 type/field/relation) | 代码与表结构本身,不建表 |
| **M2 类型定义** | 场景模板内的对象类型/属性/关系类型 | `scene_template(_version)` + `object_type` + `field_def` + `relation_type` |
| M1 工作空间数据 | 对象/字段/关系实例 | `data_object` / `data_field_value` / `data_relation`(已实现) |
| M0 运行/快照态 | 版本历史、快照 | `*_history` / 未来快照表 |

DSML(B 级):场景模板=轻量 DSML;抽象语法=M2 类型定义,具体语法=视图,语义=规则/状态机,输出映射=模板。**不建独立语言工具链**。

## 3. 数据模型(迁移 V3,增量)

### 3.1 模板与版本(新表)

```
scene_template(
  id UUID PK, code VARCHAR(128) UNIQUE, name VARCHAR(256),
  created_by VARCHAR(64), created_at TIMESTAMPTZ)

scene_template_version(
  id UUID PK,
  template_id UUID FK → scene_template(id),
  version INTEGER NOT NULL,            -- 单调递增,(template_id, version) 唯一
  status VARCHAR(16) NOT NULL,         -- draft | published(发布后不可变)
  published_at TIMESTAMPTZ,
  published_by VARCHAR(64),
  UNIQUE(template_id, version))
```

类型定义归属某个**模板版本**:为 `object_type / field_def / relation_type` 各增列
`template_version_id UUID NULL FK → scene_template_version(id)`(NULL = 兼容现存 demo workspace 的"无模板直挂"类型,不破坏 V1/V2 seed)。

### 3.2 属性类型化(扩列 field_def)

```
ALTER TABLE field_def ADD COLUMN data_type VARCHAR(24) NOT NULL DEFAULT 'string';
ALTER TABLE field_def ADD COLUMN constraints JSONB NOT NULL DEFAULT '{}'::jsonb;
```

`data_type` 封闭集(批1 即固定,新增须改契约附录):
`string | text | integer | number | boolean | date | datetime | enum | ref | json`。

`constraints`(按 data_type 取用,JSONB):
`minLength/maxLength`(string/text)、`min/max`(integer/number)、`pattern`(string,**白名单正则,长度上限,禁回溯炸弹**)、`enumValues`(enum)、`refObjectTypeCode`(ref)。

### 3.3 工作空间实例化绑定(扩列 workspace)

```
ALTER TABLE workspace ADD COLUMN template_id UUID NULL FK → scene_template(id);
ALTER TABLE workspace ADD COLUMN template_version INTEGER NULL;
```

实例化语义:从某**已发布**模板版本创建工作空间时,把该版本的类型定义**复制**进该工作空间(types 仍以 workspace 为运行期归属,保留批1–3 校验路径 `data_object → object_type(同 workspace)` 不变),并记录 `(template_id, template_version)` 溯源。复制而非引用的代价(模板演化需再同步)正是 §5 兼容校验要解决的问题。

## 4. M2 命令面(需契约附录 → 人工 spec-change)

> **关键治理点**:§3 现有命令注册集(CreateObject…BatchCommand)是 **M1 数据命令**,AG-301 锁定。M2 授权命令是**新命令类型**,必须先经人工 spec-change 增补契约(AG-501 禁止 AI 改契约),Codex 方可实现。建议落点:新增 `contracts/元模型命令契约.md` + 对应 Schema,**独立端点** `POST /workspaces/{id}/meta-commands`(与 M1 `/commands` 分离,保持 M1 注册集纯净)。

| 命令 | 批次 | 语义 | 主要校验 / 错误码(KERNEL- 前缀,AG-311) |
|---|---|---|---|
| `DefineObjectType` | 批1 | 在 draft 模板版本下建/改对象类型 | code 同空间唯一;已发布版本下禁改 → `KERNEL-409-TEMPLATE-VERSION-IMMUTABLE` |
| `DefineFieldDef` | 批1 | 建/改属性定义(含 data_type+constraints) | 归属对象类型存在;data_type 在封闭集;约束与类型相容 → `KERNEL-422-FIELD-CONSTRAINT-INVALID` |
| `DefineRelationType` | 批1 | 建/改关系类型(source/target 类型、方向、基数、强弱、层级) | source/target 类型存在;层级类型须 one_to_many(承 V2 约束) |
| `PublishTemplateVersion` | 批2 | draft → published(冻结) | 已发布禁重复发布/禁覆盖 → `KERNEL-409-TEMPLATE-PUBLISHED-IMMUTABLE` |
| `InstantiateWorkspace` | 批2 | 从已发布版本建空间并复制类型 | 仅允许 published 版本 → `KERNEL-422-TEMPLATE-NOT-PUBLISHED` |
| `ApplyTemplateVersion` | 批2 | 把更高版本应用到已有空间(走兼容校验) | 见 §5;阻断项 → `KERNEL-409-TEMPLATE-MIGRATION-REQUIRED` |

所有 M2 命令同样遵守 AG-321(`created_by/updated_by` 取认证上下文)、AG-110 命令入口纪律、AG-201 事务内零出站。

## 5. 演化兼容校验(4.7 最小实现:两档)

`ApplyTemplateVersion(workspace, fromVersion→toVersion)` 比对两版本类型定义,逐项判级:

| 变更 | 档位 | 处置 |
|---|---|---|
| 新增对象类型 / 新增可选字段 / 放宽约束(maxLength↑、min↓) / 新增枚举值 / 新增关系类型 | **新增兼容** | 自动应用,事件记录 |
| 新增必填字段(存量对象缺值) / 收紧约束(maxLength↓、范围收窄) / 删除字段或类型 / 删除枚举值(有存量引用) / 改 data_type | **收紧阻断** | 拒绝并返回受影响存量清单 + `KERNEL-409-TEMPLATE-MIGRATION-REQUIRED`;须人工迁移确认后另行处理 |

**只做这两档**,三方合并 / 自动迁移工具进 BL-05(禁实现)。校验器是纯读 + 纯函数,不写主数据。

## 6. 类型校验挂点(注入批1–3,不改其逻辑)

CreateObject/UpdateFields 现仅校验必填。批1 增 `FieldValidator`(kernel/internal,纯函数),在命令预检阶段(AG-201 允许的"规则预检"内)按 `field_def.data_type + constraints` 校验:类型匹配、必填、范围/长度/枚举/正则、ref 指向存在对象。失败 → `KERNEL-422-FIELD-VALUE-INVALID`(details 列出违例字段)。**以新增校验器 + 在现处理器调用一行的方式注入**,不重写处理器(AG-405)。

## 7. 批次切分(对应任务卡)

- **批1 = T-V33-201(MVP-0 关键切片)**:迁移 V3(扩列 + scene_template/version 表)、`Define{ObjectType,FieldDef,RelationType}` 命令 + meta-commands 端点、`FieldValidator` 类型校验挂点、单测。**前置:契约附录(人工)。**
- **批2 = T-V33-202**:发布/实例化/兼容校验(`Publish/Instantiate/ApplyTemplateVersion`)。
- 可视化模板编辑器、三方合并、自动迁移 → BL-05,禁入。

## 8. 验收口径(MVP-0 第 1/2/3 项)

用一个真实场景模板(建议"技术方案")走通:`DefineObjectType(需求)` → `DefineFieldDef(预算:number,min=0)` → `DefineRelationType(分解,层级)` → 在该空间 `CreateObject` 一条对象并对 `预算` 写非法值被 `KERNEL-422` 拒绝、写合法值通过。批2 再演示发布→建空间→演化阻断。

## 9. 禁止事项

不改 contracts/schemas/*.json 与现 §3 注册集(经独立 addendum);不改批1–3 处理器既有逻辑(只新增挂点);不建图编辑器/迁移工具(BL-05);不引新依赖(AG-502);M2 命令不得在事务内做重操作(AG-109/201)。
