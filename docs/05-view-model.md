# 05 — 阶段5 视图模型设计稿(读模型 + 多视图同源 + SelectionRef)

- 状态:设计稿(Claude 产出,待用户确认 → 转 Codex 任务卡 T-V33-501/502/503)
- 依据:说明书 8.2/8.4/8.4.1/9.2/10.1.1;契约 §7 Outbox / §4 事件信封;`docs/prototype/阶段5-线框-v1.md`;AGENTS.md AG-101/102/201/202/203/209/210
- 对应 MVP-0:第 6(表格)/7(树)/8(图谱)/9(多视图选中同步)项
- 主线:**统一数据源的"多视图同源"**——所有视图只读同一读模型,绝不维护各自数据副本

---

## 1. 总体架构(CQRS 读侧)

```
命令(写) → 主数据事务 + event_outbox(已实现 阶段1)
                         │
            OutboxRelay 投递(已实现 104)→ RabbitMQ workspace.{id}.events
                         │
        ReadModelProjection 消费(幂等 AG-210)→ 读模型表 rm_*
                         │
            查询端点 GET /workspaces/{id}/views/*  ← 视图(表格/树/图谱)只读
                         │
                  SelectionRef 选择协调器(纯前端,零写 AG-209)
```

要点:
- **视图不碰主数据**:视图只读 `/views/*` 查询端点(经 `shared/api-client`),禁止 import kernel/engines、禁止把对象/字段/关系落 storage(AG-101/102)。
- **读模型是投影,不是第二事实源**:rm_* 由事件投影而成,可随时从事件重建;查询只读 rm_*,绝不回查主数据全表(AG-202)。
- **最终一致可见**:投影有延迟,前端用"同步状态●"三态明示(线框 W-1.2),不得把延迟当 bug。

## 2. 读模型表(迁移 V5,落 server 模块)

> 归属:AGENTS §1.1 明确"server:…readmodel 投影";故读模型表与投影、查询端点都在 `server`。迁移 `V5__readmodel.sql`(承 V1–V4 之后)。

```
rm_object(
  workspace_id UUID, object_id UUID, object_type_code VARCHAR(128),
  status VARCHAR(32), version BIGINT,
  fields JSONB,                         -- 当前字段值快照(fieldCode→value),供表格整行渲染
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, object_id))
CREATE INDEX rm_object_type_idx ON rm_object (workspace_id, object_type_code, object_id);

rm_relation(
  workspace_id UUID, relation_id UUID, relation_type_code VARCHAR(128),
  source_id UUID, target_id UUID, hierarchical BOOLEAN, status VARCHAR(32), version BIGINT,
  PRIMARY KEY (workspace_id, relation_id))
CREATE INDEX rm_relation_source_idx ON rm_relation (workspace_id, relation_type_code, source_id);
CREATE INDEX rm_relation_target_idx ON rm_relation (workspace_id, relation_type_code, target_id);

rm_consumed_event(                       -- 幂等去重(AG-210)+ 投影进度
  consumer_group VARCHAR(64), event_id CHAR(26),
  PRIMARY KEY (consumer_group, event_id))
```

字段类型/列由 `object_type/field_def`(M2)驱动,表格列定义经类型查询取得(见 §4),rm_object.fields 只存值。

## 3. 投影消费者(ReadModelProjection)

- `ReadModelProjection.apply(EventEnvelope)`:RabbitMQ 无关的纯投影逻辑,按 eventType 更新 rm_*;经 `IdempotentConsumerRegistry`(104 已建)以 `consumer_group=readmodel` + eventId 去重(AG-210),先查 `rm_consumed_event`,已消费则跳过。
- 事件映射:`ObjectCreated`→insert rm_object;`FieldChanged`→更新 fields + version;`StateChanged`→status;`RelationCreated`→insert rm_relation;`RelationUnlinked/Archived/SoftDeleted`→status 置终态;`RelationUpdated`→端点/字段;`BatchCommitted`→其子事件已各自投递,不二次处理。
- **顺序**:按聚合 `sequence` 应用;乱序/旧序事件丢弃(rm 行 version ≥ 事件 version 则跳过)。
- **RabbitMQ 适配**:薄 `@RabbitListener` 适配器接收 workspace.{id}.events,反序列化信封后调 `apply()`;RabbitMQ 客户端仅出现在该适配器(AG-506),投影本身可脱离 RabbitMQ 单测。
- 投影不写主数据、不发命令(只写 rm_*)。

## 4. 查询端点(只读;无新命令/事件,故不需 AG-301 契约 addendum)

> 这些是**读端点**,不引入新 commandType/eventType,故**不触发 AG-301/AG-501 契约门**;消费的事件均为已注册类型。端点形状在本设计稿固化,由 springdoc 生成 OpenAPI(104 已接)。建议(非阻塞)补 `contracts/读模型查询契约.md` 备查。

| 端点 | 用途 | 约束(AG-202/203) |
|---|---|---|
| `GET /workspaces/{id}/views/object-types` | 表格列定义(对象类型 + 字段定义 + dataType/constraints) | 按 workspace |
| `GET /workspaces/{id}/views/objects?objectType=&page=&pageSize=` | 表格行(分页对象列表 + fields 快照) | pageSize≤200;必带 workspace+objectType |
| `GET /workspaces/{id}/views/objects/{objectId}` | 详情面板(对象 + 字段 + 关系摘要) | 单对象 |
| `GET /workspaces/{id}/views/relations?relationType=&direction=&sourceId=&depth=` | 图谱边集 | direction+relationType 必填;depth≤5;命中 rm_relation 索引,禁全图 |
| `GET /workspaces/{id}/views/tree?relationType=&rootId=` | 树视图(层级关系分解,relationType 须 hierarchical) | 由 rm_relation 或闭包构树,按 rootId 限范围 |
| `GET /workspaces/{id}/views/sync-status` | 同步状态(待投影事件数 / 是否追平) | 供 W-1.2 三态 |

所有端点强制 workspace 范围过滤(AG-503),分页/范围必带(AG-202),关系查询带方向+类型+深度(AG-203)。

## 5. SelectionRef 选择协议(纯前端,零写)

- 载荷:`SelectionRef { entityType: object|field|relation, entityId, fieldCode? }`(承线框 W-3.1)。
- 选择协调器:工作空间级单例,广播当前选择;各视图订阅 → 高亮/定位;详情面板订阅 → 刷新。
- **纪律(AG-209/102)**:选择是纯前端态——不发命令、不写库、不发全工作空间查询、不触发全图重绘;切换工作空间即清空;不落 storage(仅 `ui.` 前缀偏好可落)。
- 同一实体多处表达 >100 时只高亮可见范围;未加载的目标提供"定位"按钮显式跳转(8.4.1,1s 内)。

## 6. 视图 SDK 边界(packages/views)

- views 只依赖 `shared`(含 api-client 读查询 + SelectionRef 协议),**禁止** import kernel/engines/server(AG-101);依赖红线由现有 `architecture:check` 覆盖。
- 视图插件接口不写死视图类型(为 BL-04 可配置视觉语法预留);表格/树/图谱各为一个视图插件,消费同一读模型 + 同一 SelectionRef。
- 编辑回写:表格单元格编辑 → 经 api-client 调 M1 命令 `UpdateFields`(带 expectedFieldVersion,§5.4),不直写;冲突走线框 §4 弹层。

## 7. 视图逐项(MVP-0 6/7/8/9)

- **表格(#6)**:行=对象、列=field_def(类型驱动,非硬编码);分页(pageSize≤200);单元格编辑→UpdateFields;终态行只读(线框 W-2.x)。
- **树(#7)**:hierarchical 关系(如"分解",承闭包表)→ 缩进树;懒展开,按 rootId/depth 限范围。
- **图谱(#8)**:relations → 节点-边图(AntV/G6 或现有图库);按 relationType+direction+depth 拉边,>N 节点只渲染可见范围。
- **多视图选中同步(#9)**:表格行 / 树节点 / 图谱节点 / 详情面板四处共享 SelectionRef;点任一处→其余高亮/定位;字段级选中(详情面板字段)→表格对应单元格描边(为阶段6 文档属性级联动预留同协议)。

## 8. 批次切分(任务卡)

| 卡 | 范围 | 归属 | 依赖 |
|---|---|---|---|
| **T-V33-501** | 读模型 V5 迁移 + ReadModelProjection 消费者 + 查询端点 + sync-status | server | 104(Outbox/RabbitMQ)✓ |
| T-V33-502 | 表格视图 + SelectionRef 协调器 + 详情面板 + 对象/字段级联动(10.1.1 第一步) | views/web | 501 |
| T-V33-503 | 树视图 + 图谱视图,接入同一 SelectionRef(10.1.1 后续步) | views/web | 501/502 |

**501 是所有视图的前置**(无读模型则无数据源),且纯后端、无新依赖、无契约门,应先行。

## 9. 验收口径(MVP-0 6/7/8/9)

端到端:建类型→建对象/关系(已具备)→ 表格列由类型驱动、行分页展示 → 树按分解关系展开 → 图谱按关系连边 → 任一视图选中,其余三处同步高亮 → 单元格改值经 UpdateFields 回写、冲突弹层、投影刷新使各视图秒级一致(同步状态●可见)。

## 10. 禁止事项(横切)

视图不复制主数据、不 import 内核、不落主数据 storage(AG-101/102);选择联动零写、零全图查询(AG-209);查询必分页/带范围(AG-202/203);投影幂等、不写主数据;不实现:文档视图(阶段6)、跨用户选择广播、协同编辑、失锚 UI(评审批2)、视图缓存优化、任何 backlog 条目。
