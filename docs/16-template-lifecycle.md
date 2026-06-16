# 阶段2 批2 设计稿 — 模板版本生命周期(发布 / 实例化 / 演化)

状态:**设计稿(待用户确认)**。承 docs/04 §3.3/§5,补齐 Stage 2 缺口。**纯后端**(kernel/server)。把搁置的 gen-d(继承/重定义/值类型的演化判级)并入 ApplyTemplateVersion。

## 0. 现状与缺口

已就绪:`scene_template`/`scene_template_version(status draft|published)`、`object_type`/`value_type`/`field_def`/`relation_type`/`rule_def` 各带 `template_version_id`、`workspace(template_id, template_version)`、Define{ObjectType,FieldDef,RelationType,ValueType}。

**缺**:`PublishTemplateVersion`/`InstantiateWorkspace`/`ApplyTemplateVersion` 三命令未实现 → 模板只能在"作者工作空间"里定义,无法发布锁版、无法实例化到新空间、无法做演化兼容校验(违 4.7「类型变更需兼容存量」)。

## 1. 生命周期

```
作者空间内 Define*(draft 版本,template_version_id=TV)
   │  PublishTemplateVersion(TV)          → TV 冻结(status=published)
   ▼
InstantiateWorkspace(template, version)   → 新空间 Wn,复制 TV 的全部类型(id 重映射)
   │                                        Wn.(template_id, template_version) 记溯源
   ▼
ApplyTemplateVersion(Wn, TV2)             → 比对 TV→TV2 逐项判级:
                                            新增兼容→自动应用;收紧→阻断 + 受影响存量
```

- **类型归属**:`object_type.workspace_id` 恒非空。模板的类型定义存在"作者空间"里、以 `template_version_id` 归属某版本。实例化是**复制**进新空间(运行期归属新空间,保留批1–3 `data_object→object_type(同 workspace)` 校验路径不变)。
- **复制而非引用**(承 docs/04):新空间持有自己的类型副本;演化靠 ApplyTemplateVersion 再同步,正是 §4 要解决的。

## 2. PublishTemplateVersion(templateVersionId)

- draft → published(`UPDATE scene_template_version SET status='published'`)。
- 校验:版本存在且为 draft(已 published 重复发布 → `KERNEL-409-TEMPLATE-VERSION-IMMUTABLE`);该版本至少有 1 个 object_type(空模板拒,`KERNEL-422-TEMPLATE-EMPTY`,可选)。
- 发布后 Define* 在该版本下被拒(已由各 Define 处理器的 published 检查保证)。

## 3. InstantiateWorkspace(templateId, version, workspaceName)

- 仅允许 **published** 版本(否则 `KERNEL-422-TEMPLATE-NOT-PUBLISHED`)。
- 建新 `workspace`(status ACTIVE,template_id/template_version 溯源),把该版本的 `value_type → object_type → field_def → relation_type → rule_def` **复制**进新空间:
  - 生成 old→new UUID 映射;
  - **两遍写**:先插入各表(FK 暂置 null 或先插独立列),再回填重映射的 FK——`object_type.parent_type_id`、`value_type.parent_value_type_id`、`field_def.{object_type_id,value_type_id,redefines_field_def_id}`、`relation_type.{source_type,target_type}`、`rule_def.{scope_object_type_id,scope_field_def_id}` 全部映射到新 id;
  - 复制后类型的 `template_version_id` 置 null(新空间的运行期类型,不再属模板版本)或保留溯源——**置 null**(与 demo 直挂语义一致,演化对比改用 workspace.template_version 溯源)。
- 复制是**批量操作**:数据量大时走冷路径任务(AG-207);MVP 可同步但设上限(类型数 ≤ 合理阈值)。

## 4. ApplyTemplateVersion(workspaceId, toVersion)——含 gen-d

工作空间当前类型 = 从 `fromVersion`(=workspace.template_version)实例化而来。比对 `fromVersion` 与 `toVersion` 的类型定义,逐项判级:

| 变更 | 档位 | 处置 |
|---|---|---|
| 新对象类型/值类型/关系类型;新可选字段;放宽约束(maxLength↑/min↓);新枚举值;**新增子类型**;重定义进一步收紧 | **新增兼容** | 自动应用(同步新空间类型副本到 toVersion) |
| 新必填字段(存量缺值);收紧约束;删字段/类型;删枚举值(有引用);改 data_type;**改父类型(泛化变更)**;**重定义/值类型改为非子孙**;**父级字段改严致存量子类型实例违反** | **收紧阻断** | 拒绝 + 受影响存量清单 + `KERNEL-409-TEMPLATE-MIGRATION-REQUIRED` |

- **gen-d 维度**(本批新增,复用泛化阶段逻辑):泛化变更(parent_type 改/去)、重定义协变(子值类型必须仍是子孙、约束仍更严)、值类型链演化——任一导致存量实例违反即阻断。
- 受影响存量判定:对 toVersion 收紧项,扫 workspace 内该类型(及子类型)实例是否违反(复用 `resolveEffectiveFields` + FieldValidator 风格,只读)。
- 三方合并 / 自动迁移工具仍属 BL-05,禁实现。只做"新增兼容自动 / 收紧阻断"两档。

## 5. 命令与契约 addendum(人发起 spec-change)

meta-commands schema 增 3 命令(`PublishTemplateVersion`/`InstantiateWorkspace`/`ApplyTemplateVersion`);error-codes 增登记:

| code | http | 含义 |
|---|---|---|
| KERNEL-422-TEMPLATE-NOT-PUBLISHED | 422 | 实例化引用未发布版本 |
| KERNEL-409-TEMPLATE-MIGRATION-REQUIRED | 409 | 演化含收紧项,需人工迁移(返回受影响存量) |
| KERNEL-422-TEMPLATE-EMPTY | 422 | 发布空模板版本(可选) |

(`KERNEL-409-TEMPLATE-VERSION-IMMUTABLE` 已登记。)契约文档:`contracts/元模型命令契约.md` 增 "批2 addendum" 段 + fixtures(正:三命令各一;反:实例化未发布版本、apply 缺版本)。

## 6. 红线

- **AG-110**:经命令入口;**AG-109/207**:实例化/演化是批量,大数据量走冷路径,不在热命令路径跑重活;**AG-201**:事务内零出站。
- **发布不可变**:published 版本的类型/继承/规则全冻结。
- **复制完整性**:id 重映射必须闭合(无悬空 FK);环不可能(继承阶段已禁)。
- 演化判级器**只读**,不写主数据(判级阶段);自动应用阶段才写(经命令事务)。

## 7. 拆卡建议(串行,逐卡封闭清单 + verify)

| 卡 | 范围 | 依赖 |
|---|---|---|
| **batch2-spec**(人发起) | meta-commands 加 3 命令 + 3 错误码 + fixtures + check-contracts | 无 |
| **batch2-a 发布+实例化** | PublishTemplateVersion + InstantiateWorkspace(复制+id重映射)+ 迁移(若需 instantiate 记录)+ 集成测试(发布锁版、实例化复制完整、未发布拒) | batch2-spec |
| **batch2-b 演化(含 gen-d)** | ApplyTemplateVersion 两档判级(含泛化/重定义/值类型维度)+ 受影响存量扫描 + 自动应用 + 集成测试(新增兼容自动、收紧阻断含继承改动) | batch2-a |

## 8. 验收口径

定义模板版本(需求/性能需求 含继承、name 用值类型自然段)→ Publish → Instantiate 新空间(类型副本完整、父链/重定义/值类型引用都对)→ 在新空间建数据走通校验 → 出 V2(给需求加必填字段)→ ApplyTemplateVersion 被 `KERNEL-409-TEMPLATE-MIGRATION-REQUIRED` 拦并列出受影响存量;出 V3(仅加可选字段)→ 自动应用成功。
