# T-V33-FED-2 — M2M 转换(定义 + 执行 + 幂等重投影)

蓝本:`docs/20` §1.B、§3。前置:fed-spec 契约在 main(DefineTransformation/RunTransformation schema + 夹具 + M2M-* 错误码已就位);fed-1 对应互查已合(v1.28)。**server 域**(需 engines `RuleParser` 评估映射表达式 + 经命令入口生成目标 —— 与 kernel←engines 方向一致,落 server,同 DefineDerivedField/TemplateLifecycleService)。

## 范围(两条命令,均经 MetaCommandController 路由)

### 1. DefineTransformation —— 持久化转换定义(仿 DerivedFieldRepository)
- 校验载荷;每个 `objectMappings[].fieldMappings[].expression` 用 `RuleParser.parse` 校验语法(失败→`M2M-400-MAPPING-INVALID`)。
- 校验 `correspondenceRelationCode`、各 `sourceTypeCode`/`targetTypeCode`/`sourceRelationCode`/`targetRelationCode` 在该 workspace(或 templateVersion)存在(不存在→`M2M-400-MAPPING-INVALID`,details 指明缺失 code)。
- 持久化到新表 `m2m_transformation`(object_mappings / relation_mappings 存 jsonb)。
- `command_log` 幂等(同 key 同载荷→replay;同 key 异载荷→`KERNEL-409-IDEMPOTENCY-CONFLICT`),仿 DerivedFieldRepository.replay/remember。

### 2. RunTransformation —— 读源生成目标 + correspondence + provenance(幂等重投影)
- 按 `transformationCode` 载入定义(不存在→`M2M-422-SOURCE-UNRESOLVED`)。
- **读源只读**(AG-105/101):从读模型 `rm_object`(按 sourceTypeCode,**分页有界**)读源对象 + fields;`rm_relation`(按 sourceRelationCode)读源关系。
- **对象映射**:对每个源对象,
  - 用 `RuleEvaluator` 以"该源对象 fields"为 EvalContext 评估各 fieldMapping.expression(仿 DerivedEvaluator 的单对象取值;**不做跨对象 traverse**,M2M 是单源→单目标投影);
  - 经 `KernelCommandService.createObject(targetType, 评估出的 fields)` 生成目标对象(**AG-110 命令入口**);
  - 经 `createRelation(correspondenceRelationCode, source→target)` 建对应链;
  - 写 `m2m_provenance`(transformation_code, source_object_id, target_object_id, run_id)。
- **关系映射**:对每条源关系(sourceRelationCode)且其两端源对象都已生成目标者,经 `createRelation(targetRelationCode, 目标source→目标target)` 生成目标关系;两端目标缺失→跳过该条(不报错,记 skipped 计数)。
- **幂等重投影(本卡定调:按 correspondence 幂等,不重复生成,源变不回写)**:
  - 子命令 idempotencyKey **确定式**派生:对象用 `t:<code>:o:<sourceObjectId>`、对应链用 `t:<code>:c:<sourceObjectId>`、目标关系用 `t:<code>:r:<sourceRelationId>`。靠 kernel 自身 command_log 去重——重跑(即便外层 run key 不同)对同一源只生成一次目标,**不重复**。
  - 运行前查 `m2m_provenance` 跳过已转换源(省去重复评估);kernel 去重是安全网。
  - **源已变更后的目标更新 = 不在本卡**(留 fed 后续/再同步);本卡只"生成"。
- **有界**(AG-202/203):源对象上限 `MAX_SOURCE_OBJECTS=1000`、单次生成上限 `MAX_GENERATED=2000`,超限→`M2M-422-SOURCE-UNRESOLVED`/`M2M-422-TARGET-UNRESOLVED`(details 给计数与上限),不静默截断。
- 返回 `CommandResult`(ACCEPTED),details 可含 generated/skipped 计数。

## 封闭文件清单

**新增**
- `packages/server/src/main/resources/db/migration/V14__m2m_transformation.sql` — 表 `m2m_transformation`(id, workspace_id, template_version_id NULL, code, name, correspondence_relation_code, object_mappings jsonb, relation_mappings jsonb, created_by/updated_by/created_at/updated_at;`UNIQUE(workspace_id, code)`)+ `m2m_provenance`(id, workspace_id, transformation_code, source_object_id, target_object_id, run_id, created_at;索引 (workspace_id, transformation_code, source_object_id))。
- `packages/server/src/main/java/com/mnext/server/TransformationRepository.java` — DefineTransformation(校验+解析+持久化+幂等)。
- `packages/server/src/main/java/com/mnext/server/TransformationRunner.java` — RunTransformation(读源+评估+经命令生成+correspondence+provenance+幂等+有界)。
- `packages/server/src/main/java/com/mnext/server/TransformationDtos.java` — DefineTransformationRequest / RunTransformationRequest + 映射记录(ObjectMapping/FieldMapping/RelationMapping)。
- 测试 `packages/server/src/test/java/com/mnext/server/TransformationIntegrationTest.java`。

**修改**
- `packages/server/src/main/java/com/mnext/server/MetaCommandController.java` — 注入 TransformationRepository + TransformationRunner;`switch` 加 `case "DefineTransformation"` / `case "RunTransformation"`;加两个 payload 解析私有方法(仿 `derivedField(...)`)。

**零碰**:kernel、engines、views/web、contracts(schema/契约/夹具/error-codes 已在 main)、kernel 迁移、CommandController。

## 红线 / 门禁

- **AG-110**:目标对象/关系**必须**经 `KernelCommandService` 命令入口生成,**不得**直接 INSERT 到 data_object/relation。
- **AG-105/101**:读源走读模型只读,不改源。
- **AG-201**:不在事务外产生副作用;每次 createObject/createRelation 各自成命令(各自 tx + outbox)。
- **AG-202/203**:源读取分页、生成有上限。
- **AG-301/501**:不新增命令类型/错误码(已在 fed-spec);若发现缺口→停,回报人发起 addendum,**不得**擅自加。
- **AG-405**:封闭清单 + 最小改动自检;完成发 `git diff --stat main` 比对。
- `pnpm verify` 全绿 + jacoco ≥0.80;**集成测试 Docker 起、server 测试汇总 Skipped:0**。落盘防截断自检。

## 验收(集成测试覆盖)
1. DefineTransformation:合法映射→ACCEPTED;表达式语法错→`M2M-400-MAPPING-INVALID`;未知 type/relation code→`M2M-400-MAPPING-INVALID`;同 key 重放→replayed=true。
2. RunTransformation 基本:建 2 源 Block(各 bandwidth)+ 1 源 Connector → 运行 → 生成 2 目标 node(capacity = 评估值)+ 1 目标 link;每目标有 correspondence 回指源;provenance 有记录。
3. **幂等重投影**:再次 RunTransformation(新外层 key)→ 目标对象/关系**数量不变**(kernel 去重);provenance 不重复。
4. 有界:源超 `MAX_SOURCE_OBJECTS` → `M2M-422-SOURCE-UNRESOLVED`。
5. 关系映射两端目标缺失→该条跳过、不报错。

## 跟进
fed-3:大 e2e 收官(SysML Block+Connector → RunTransformation → 总线 node+link 带 correspondence → 总线派生 total_load + 带宽规则判超),把 SysML+M2M+总线+派生+规则焊成一条端到端链。
