# 10 — 阶段7 正式交换设计稿(快照前置 + ReqIF/XMI 概览)

- 状态:设计稿(Claude 产出;§2 快照详设可直接转 T-V33-704;§4 ReqIF/§5 XMI 为概览,待标准调研后另出详设)
- 依据:AGENTS.md **AG-208**(输出入参只能 snapshotId)、AG-110/201/507/508;说明书 §1488 输出快照字段、§1788/§2020/§2345/§2968 输出快照闭环、§810 生成可重放、§F.5 标准对齐;已落 701(结构化 diff)/702(JSON 轻交换)
- 对应:阶段9"成果输出与制品交换"的正式化;承 701/702 双向骨架
- 主线:**成果输出与制品交换以不可变快照为基线**——输出/交换/diff 的"A 侧"是 snapshotId 寻址的不可变捕获,而非实时 workspaceId(AG-208);ReqIF/XMI 在快照之上做双向解析→映射→diff→回写

---

## 1. 阶段7 总体与切分

| 卡 | 范围 | 依赖 | 风险 |
|---|---|---|---|
| **T-V33-704 快照前置** | snapshotId 不可变快照(捕获/检索/作为 diff A 侧)+ V6 迁移 | 701/702、501 读模型 | 低-中(新表,设计需冻结) |
| T-V33-705 ReqIF 最小子集 | 需求交换:ReqIF 解析→映射→diff(vs 快照)→回写 + 导出 | 704 | 中-高(ReqIF schema 调研) |
| T-V33-706 XMI 最小子集 | UML/MOF 模型交换:XMI 解析/映射 | 704 | 高(MOF 元模型对齐) |

**本设计稿先冻结 §2 快照(704);705/706 待各自标准调研后另出详设。**

## 2. 快照前置(T-V33-704)详设

### 2.1 语义(AG-208)

- 快照 = 某时点对**读模型数据集**(对象+关系)的**不可变捕获**,以 `snapshotId` 寻址,带**内容哈希**(content hash)与元数据。
- **AG-208 铁律**:输出渲染器 / 正式交换导出的入参**只能是 snapshotId**,禁止传 workspaceId 直读实时数据。本卡先把"snapshotId 可寻址的捕获"立起来,并把 **diff/export 的 A 侧改为可用 snapshot**。
- **定位**:快照是**派生的输出制品**(非主数据,类比 rm_* 读模型由事件投影而成),**append-only / 不可变**(无 update/delete);AG-110(写经命令入口)约束的是**主数据**,不约束派生快照存储——本卡只读 rm_* 捕获、只写 snapshot 表,不碰主数据、不发内核命令。

### 2.2 数据(迁移 V6,落 server)

```
snapshot(
  snapshot_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by VARCHAR NOT NULL,          -- 认证上下文(AG-321)
  scope_object_type VARCHAR NULL,       -- 可选范围过滤(null=全工作空间)
  data_version BIGINT NOT NULL,         -- 捕获时读模型最大 version(口径)
  content_hash CHAR(64) NOT NULL,       -- 对规范化 DataSet 的 SHA-256
  payload JSONB NOT NULL)               -- 捕获的不可变 DataSet(objects+relations)
CREATE INDEX snapshot_ws_idx ON snapshot (workspace_id, created_at);
```
- `payload` 即 701/702 的 `DataSet`(对象:objectId/objectTypeCode/fields/status/version;关系:relationId/...);捕获自 `ReadModelRepository.dataSet(workspace[, scopeObjectType])`。
- `content_hash` = 对规范化(确定性排序)DataSet 的 SHA-256,使同内容快照可比对(§810 可重放、§1488 文件哈希)。

### 2.3 端点(server)

```
POST /workspaces/{id}/snapshots            体:{scopeObjectType?}
  → 捕获当前读模型 DataSet → 算 hash → 写不可变行 → 返回 {snapshotId, createdAt, dataVersion, contentHash}
GET  /workspaces/{id}/snapshots            → 列表(分页,按 created_at desc,有界)
GET  /workspaces/{id}/snapshots/{snapshotId} → 返回元数据 + 不可变 payload(DataSet);同一 id 每次返回同一字节
```
- 快照**不可变**:无 PUT/DELETE(MVP 不做删除/GC;留后续)。
- **接 diff A 侧(AG-208 落地第一步)**:`POST /workspaces/{id}/diff` 与 702 `preview` 的 base 增加 `snapshot:{snapshotId}` —— `StructuredDiff.diff(snapshot.dataSet, other)`,快照作稳定 A 侧(替代/补充现 `current`)。

### 2.4 架构落点

| 模块 | 职责 |
|---|---|
| `server` | V6 迁移;`SnapshotRepository`(捕获=读 rm_* + 写 snapshot;检索;列表)+ `SnapshotController`;diff/exchange base 解析 snapshot | 只读主数据无、读 rm_*、写 snapshot;不发内核命令 |
| `engines/exchange` | **不变**——`StructuredDiff` 纯函数消费 snapshot 的 DataSet(server 传入) | 纯运算 |

- 无新**内核**命令/事件 → **不触发 AG-301/AG-501 内核契约门**(快照属输出域,非 M1)。建议(非阻塞)补 `contracts/输出快照契约.md` 备查;未来输出域正式化时再评估是否登记 `SnapshotCreated` 事件。

### 2.5 验收口径

捕获工作空间当前态 → 返回 snapshotId + contentHash;改一个对象字段后再捕获 → 新 snapshotId、新 hash、旧快照 payload 字节不变(不可变性);`GET /snapshots/{id}` 幂等返回同内容;`diff base=snapshot:{id}` 用快照作 A 侧产出结构化 diff;workspace 隔离。

## 3. ReqIF 概览(T-V33-705,待调研详设)

- ReqIF(Requirements Interchange Format,OMG)= 需求对象/属性/关系的 XML 交换。映射:ReqIF SpecObject→对象、AttributeValue→字段、SpecRelation→关系。
- 双向:导出 = snapshot→ReqIF;导入 = 解析→按 key 映射内部模型→`StructuredDiff` vs 快照/current→冲突→经 M1 命令回写(承 702)。
- **最小子集**:核心 SpecObject/SpecType/AttributeDefinition/SpecRelation;不追 ReqIF 全特性(嵌套规格层级、工具扩展、ReqIF.xhtml 富文本留后续)。解析器入 `engines/exchange`(纯,无主数据写);回写在 server 经命令。**需调研真实 ReqIF schema 后冻结子集。**

## 4. XMI 概览(T-V33-706,待调研详设)

- XMI(XML Metadata Interchange,OMG/MOF)= UML/MOF 模型序列化。映射:Class/Package→对象类型、Property→字段、Association→关系。**最重**:需对齐 MOF 元模型与本平台 M2。
- 同双向骨架;**最小子集**:基础 Class/Property/Association;不追 profile/stereotype/OCL。**需调研 XMI/UML 元模型后冻结。**

## 5. 禁止事项(横切)

不实现(本阶段):快照 GC/保留策略/删除、跨工作空间快照、ReqIF/XMI 全标准覆盖(只最小子集)、STEP/FMU/docx 输出渲染器(各独立卡)、双向自动同步、M2M 转换引擎(BL-02)、C 级工具(AG-508)。快照只读 rm_* 捕获、不碰主数据、不发内核命令、不可变;外部文件不作事实源(AG-507);回写经命令入口(AG-110);不引入未准入依赖(AG-502)。
