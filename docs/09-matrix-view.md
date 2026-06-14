# 09 — 矩阵视图设计稿(第二阶段视图 · 行×列×关系)

- 状态:设计稿(Claude 产出,待用户确认 → 转 Codex 任务卡 T-V33-603)
- 依据:说明书 §10.2 第二阶段"矩阵视图"、§6.12"矩阵单元格可表达关系、状态、评分和批注"、§5.4.1/§10.1.1 多视图选择联动(关系级)、§D 读模型;`docs/05-view-model.md`;AGENTS.md AG-101/102/202/203/209/503
- 对应:平台视图族第 4 种(文档/表格/图形已落,矩阵为说明书第二阶段钦点);非 MVP-0
- 主线:**统一数据源再加一种表达**——矩阵视图只读同一读模型,行/列=对象、单元格=两对象间的关系实例;**零数据副本**,关系级 + 对象级选择联动复用现有 SelectionRef

---

## 1. 设计原则

1. **同源、零副本**:矩阵渲染同一 `rm_*`,行/列对象与单元格关系都是已有 `objectId`/`relationId`,不另存矩阵数据(AG-101/102)。
2. **有界(AG-202/203)**:矩阵天然是 N×M,**必须分页 + 上限**(行、列各 ≤ 50/页);不一次拉全工作空间;单元格只表达"该行对象→该列对象是否存在该 relationType 关系 + 其状态/属性"。
3. **关系级联动(§5.4.1)**:点单元格 → `select({entityType:'relation', entityId:relationId})`(弱高亮两端对象);点行/列头 → `select({object})`。复用同一 `SelectionCoordinator`,纯前端零写(AG-209)。
4. **本刀只读**:矩阵单元格的创建/删除关系(在矩阵里连/断关系)留后续卡;本刀只读表达 + 联动。
5. **读端点最小新增**:矩阵需要"行对象集 × 列对象集之间某类型关系的边集",现有 `/views/relations`(按单 source)不够 → 新增**一个只读矩阵端点**(无新命令/事件,**不触发 AG-301/AG-501 契约门**,与 501 其它 `/views/*` 同性质)。

## 2. 矩阵语义

- **行**:`rowObjectType` 的对象集(分页)。**列**:`colObjectType` 的对象集(分页);允许 row=col(同类型方阵,如依赖/追溯矩阵)。
- **单元格 (r,c)**:`relationType` 从行对象 r 到列对象 c 的关系实例;无则空。单元格内容 = 关系存在标记 + `status` + 可选关系字段(评分/权重等,§6.12)。
- 典型场景:需求×功能 追溯矩阵、功能×功能 依赖矩阵、对象×对象 关系覆盖。

## 3. 读端点(只读,迁移无、契约门无)

```
GET /workspaces/{id}/views/matrix
    ?rowType=<code>&colType=<code>&relationType=<code>
    &rowPage=0&rowSize=50&colPage=0&colSize=50
→ {
    rows:  [{objectId, label, status}],            // 分页行对象(rm_object)
    cols:  [{objectId, label, status}],            // 分页列对象
    cells: [{rowId, colId, relationId, status, fields}],  // 落在本页行×列内的关系(rm_relation)
    rowTotal, colTotal
  }
```
- 实现:`ReadModelRepository` 加一查询——按 `rowType`/`colType` 取分页对象集,再取 `relationType` 且 `source_id ∈ 本页行` 且 `target_id ∈ 本页列` 的 `rm_relation`(命中既有 `rm_relation_source_idx`/`target_idx`,带 workspace,AG-202/203)。**只读 rm_*,不碰主数据(AG-101)**;`rowSize`/`colSize` ≤ 50 强制。
- 端点形状由 springdoc 生成 OpenAPI;建议(非阻塞)补 `contracts/读模型查询契约.md` 备查。

## 4. 前端(packages/views)

- 新增 `matrix/matrix-view.tsx`:`MatrixView`,props `viewClient/selection/workspaceId/rowType/colType/relationType`;拉 `/views/matrix` → 渲染表头(列对象)+ 行头(行对象)+ 单元格网格;单元格命中关系则显示标记/状态。
- `view-client.ts` 加只读 `matrix(...)` 方法(对齐端点)。
- 联动:单元格点击 → `select({relation, relationId})`;行/列头点击 → `select({object, objectId})`;`subscribe` 反向高亮(命中关系→单元格描边 + 两端行列头弱高亮;命中对象→整行/整列弱高亮)。**纯前端零写(AG-209)**;切工作空间清空。
- app 壳加"矩阵" tab,注入同一 `SelectionCoordinator`(视图再 +1)。

## 5. 架构落点

| 模块 | 职责 |
|---|---|
| `server` | 新增只读 `/views/matrix` 端点 + `ReadModelRepository` 矩阵查询(只读 rm_*,有界) | 无新命令/事件/迁移;不碰主数据写 |
| `packages/views`(`matrix/`) | `MatrixView` 组件 + view-client `matrix()`;关系级/对象级联动 | 只依赖 shared,零副本(AG-101/102) |
| `packages/web` | 矩阵 tab,注入同一 SelectionCoordinator | 无新依赖 |

依赖红线:现有 `architecture:check` 覆盖;**禁止新增依赖(AG-502)**;无新命令/事件 → 无契约门。

## 6. 批次切分

| 卡 | 范围 | 依赖 |
|---|---|---|
| **T-V33-603** | `/views/matrix` 只读端点 + `MatrixView` + 关系级/对象级联动 + 单测(server 集成 + 前端) | 501 读模型、502/503 选择协调器 |
| 后续(可选) | 在矩阵单元格就地连/断关系(经 `CreateRelation`/`Unlink` 命令) | 603 |

## 7. 验收口径

端到端:选 rowType=需求、colType=功能、relationType=追溯 → `/views/matrix` 返回分页行列 + 命中单元格 → 矩阵网格渲染、命中格显示关系标记 → 点单元格 → 关系级选中,表格/图谱/详情同步高亮该关系 + 两端弱高亮 → 点行头 → 对象级选中联动 → 翻页有界(≤50×50)→ 切工作空间清空;全程只读读模型、零副本、零写。

## 8. 禁止事项

不实现:矩阵内连/断关系(后续卡)、单元格批注/评分编辑(评审/编辑后续)、矩阵导出(阶段7)、看板/甘特/BI/三维/Map 等其它视图、全量无界矩阵、跨用户广播、任何 backlog 条目。矩阵不复制主数据、不 import 内核/引擎(AG-101/102);查询有界带范围(AG-202/203);联动零写(AG-209);端点只读不发命令/不写库;无新依赖(AG-502)。每步一 commit,完成后停止等待审查。
