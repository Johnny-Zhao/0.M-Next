# 08 — 阶段6 文档视图设计稿(文档表达 + 属性级联动)

- 状态:设计稿(Claude 产出,已转 Codex 任务卡 T-V33-601/602;601 已落 main)
- 依据:说明书 §5.4/§6.4/§6.12 多视图表达、§10.1.1 属性级联动、§D.4 文档视图存储模型(块树 + 数据引用块 + FieldChanged 增量刷新);阶段5 读模型与 SelectionRef(`docs/05-view-model.md`,501/502/503 已落);AGENTS.md AG-101/102/110/201/202/203/209/210
- 对应:阶段6(文档视图,多视图表达之一 + 字段级选中联动);非 MVP-0 项,MVP-0 已 15/15
- 主线:**统一数据源的"多视图同源"再加一种表达**——文档视图只读同一读模型,**绝不维护各自数据副本**(§D.4:文档不复制字段值,经数据引用块读读模型);属性级联动**复用现有 SelectionRef 协议**,零新协议、零新后端

> 视图族订正(据说明书 §2.2/§5.4/§6.4):平台视图族为 **文档 / 表格 / 图形 / 矩阵 / 看板 / 甘特 / BI / 三维构型 / Map**。**说明书无"模型视图"**;"模型"指工程模型数据与 MDE/DSML 底层思想,均非视图。已做:表格(502)、图形=图谱(503)、树(503)、文档(601)。说明书第二阶段(§10.2)钦点的下一个视图为**矩阵视图**。

---

## 1. 设计原则(承阶段5 边界 + §D.4)

1. **一种表达,同一事实源**:文档视图与表格/图形/树并列,渲染同一 `rm_*` 读模型、同一 `objectId` 身份;不另存文档副本(§D.4:文档经"数据引用块"在渲染时读读模型,不复制字段值)。
2. **零新后端**:文档大纲取自 `GET /views/tree`(层级分解关系),正文取自 `GET /views/objects` + `/views/objects/{id}`(已落 501);**不新增端点、不新增读模型表、不改 server**。
3. **属性级联动复用 SelectionRef(AG-209)**:`SelectionRef{entityType:'field', entityId:objectId, fieldCode}` 已支持字段级;文档视图只是**又一个订阅者**——点文档里的字段 → `select({field,…})` → 表格对应单元格 + 详情面板高亮;反向同理。纯前端、零写、零全图查询、切换工作空间即清空。
4. **增量刷新(§D.4)**:字段变更产生 `FieldChanged` 事件 → 投影刷新 → 文档只刷新受影响的数据引用块/节段,不整篇重载。
5. **有界渲染(AG-202/203)**:文档按 `rootId + hierarchical relationType` 限范围(同树视图),不渲染全工作空间;深度承树端点 `depth≤5`;>N 节段只渲染可见范围 + "定位"。

## 2. 文档结构来源(纯前端组装,无新端点)

输入:`workspaceId` + `rootId`(文档根对象)+ `relationType`(hierarchical,如"分解")。

```
GET /views/tree?relationType=&rootId=     → 有序层级大纲 [{objectId, depth, label, …}]
GET /views/objects?objectType=&page=&pageSize=  → 各对象 fields 快照(批量,客户端按 objectId join)
GET /views/object-types                   → 字段定义(label / dataType),决定字段渲染顺序与展示
```

组装规则(presentation only):
- 文档 = 大纲顺序的**节段流**;每个 tree 节点 → 一个**节段**(`<section data-object-id>`),缩进 = depth。
- 节段标题 = 对象主标识字段(约定:`name`/`title`,缺省回退 objectTypeCode + 短 id)。
- 节段正文 = 该对象字段按 field_def 顺序渲染为 `字段标签:值`;`text`/长文本字段渲染为段落,其余为行内键值(承 §6.12"自然语言 + 结构化数据块 + 数据引用")。
- 终态对象(archived/soft-deleted)节段置灰只读标记(承表格 W-2.x 语义)。

## 3. 属性级联动(§10.1.1 第三步,复用 SelectionRef)

- 文档视图注入**同一** `SelectionCoordinator`(与 TableView/TreeView/GraphView/DetailPanel 同实例)。
- **正向**:点节段标题 → `select({entityType:'object', entityId:objectId})`;点字段 → `select({entityType:'field', entityId:objectId, fieldCode})`。
- **反向**:`subscribe` 当前选择 → 命中本文档的 object/field 时,对应节段/字段 span 加 `aria-current`/高亮并滚动入视(1s 内,§8.4.1);未在范围内的目标给"定位"按钮显式跳转。
- **纪律(AG-209/102)**:选择纯前端态——不发命令、不写库、不发全工作空间查询、不触发全图重绘;不落 storage(仅 `ui.` 前缀偏好可落);切换工作空间清空。

## 4. 编辑(601 只读 → 602 内联)

- **601(已落)**:文档视图**只读**;字段提供"在表格中编辑"动作 = `select({field,…})` + 切表格 tab(让既有单元格编辑接手)。
- **602(本阶段批2)**:文档内**就地编辑**字段值 → `UpdateFields`(带 `expectedFieldVersion`)回写(AG-110)→ 产生 `FieldChanged` → 投影刷新只更受影响节段(§D.4);冲突 `KERNEL-409` 复用 502 弹层。块的增删/重排、富文本仍排除(更后置)。

## 5. 架构落点

| 模块 | 职责 |
|---|---|
| `packages/views`(子包 `document/`) | `DocumentView`:消费 view-client 的 `tree()`/`objects()`/`objectTypes()` 组装节段流,订阅/发布 `SelectionRef`;602 经 `CommandClient.updateFields` 回写 | **只依赖 `shared`,禁 import kernel/engines/server(AG-101);只读渲染、零数据副本(AG-102)** |
| `packages/web` | app 壳文档 tab,挂 `DocumentView` 注入同一 `SelectionCoordinator`(602 再注入 `CommandClient`) | 复用现有 client/coordinator,无新依赖 |
| `server` | **不变**(复用 501 端点 + 既有 `UpdateFields` 命令) | 零改动 |

依赖红线:`views → shared` 现有 `architecture:check` 覆盖;**禁止新增依赖(AG-502)**;无新命令/事件,**不触发 AG-301/AG-501 契约门**。

## 6. 批次切分(任务卡)

| 卡 | 范围 | 依赖 |
|---|---|---|
| **T-V33-601**(已落 main) | `DocumentView`(只读节段流)+ 字段/对象级联动接入同一 SelectionRef + app 壳启用文档 tab + 单测 | 501、502/503 |
| **T-V33-602** | 文档内联字段编辑 → `UpdateFields`(冲突同表格,§D.4 增量刷新) | 601 |

## 7. 验收口径(阶段6)

端到端:建类型→建对象/分解关系→ 切到**文档** tab → 按分解大纲渲染为缩进节段流 → 点文档里某字段 → 表格对应单元格 + 详情面板同步高亮(多视图联动)→ 反向选中→文档节段滚动高亮 → (602)文档内改字段值经命令回写、冲突弹层、投影刷新使各视图秒级一致 → 切工作空间清空;全程只读读模型、零数据副本、回写经命令。

## 8. 禁止事项(横切)

不实现:富文本/WYSIWYG/Markdown 渲染引擎、文档块树的增删与重排(602 只改既有字段值)、文档导出/成果输出(阶段7 交换)、评审批注在文档内渲染(评审批2 失锚 UI)、跨用户选择广播/协同、文档分页缓存优化、矩阵/看板/甘特/BI/三维/Map 等其它视图(说明书第二阶段另排,**说明书无"模型视图"**)、任何 backlog 条目。文档视图不复制主数据、不 import 内核/引擎、不落主数据 storage(AG-101/102);联动零写、零全图查询(AG-209);查询必带范围(rootId/depth,AG-202/203);回写经命令入口(AG-110);无新端点/命令/事件/依赖。每步一 commit,完成后停止等待审查。
