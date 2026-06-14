# 07 — 阶段7 前置:结构化 diff(基础)+ JSON 轻交换(双向)

- 状态:设计稿(Claude 产出,待用户确认 → 转 Codex 任务卡 T-V33-701/702)
- 依据:说明书"成果输出与制品交换"、F.4/F.5、8.8 三级解析;契约 §3(M1 命令)、§4(事件);AGENTS.md AG-108/110/201/507/508
- 对应 MVP-0:第 15(基础 diff)+ 13(JSON 导入导出)
- 主线:**成果输出与制品交换是双向的**——不是单向导出,而是 解析→映射→**diff**→冲突→回写;diff 是**多维结构化**(对象/字段/关系/版本),不是文本 diff

---

## 1. 设计原则(承用户初始边界)

1. **双向**:JSON 既能导出(成果输出),也能导入(解析→映射→diff→确认→回写);导入不是覆盖,而是先 diff 出差异、冲突走确认、回写经命令。
2. **结构化 diff,非文本 diff**:diff 作用在对象/字段/关系的语义结构上,产出对象 diff / 属性 diff / 关系 diff;版本 diff = 同一对象两版本的字段 diff,是其特例。
3. **外部文件永不是事实源(AG-507)**:JSON 文件解析为内部对象/字段/关系模型后,一切回写经 M1 命令入口(AG-110);绝不把 JSON 当读写目标直存直取。
4. **解析/diff 不进命令事务、不进热路径(AG-201)**:解析+diff 是请求级只读运算(JSON 体量小,MVP 同步即可;深解析/大体量留阶段7 worker);回写才发命令。
5. **交换组边界(AG-108)**:`engines/exchange` 只做解析/映射/diff(纯,无主数据写);不得被 kernel/readmodel import;回写由 server 组合根调既有 `KernelCommandService` 完成。

## 2. 结构化 diff 模型(基础 diff,#15)

输入:两个数据集 A、B(各为 `{objects:[{objectId, objectTypeCode, fields:{code→value}, status, version}], relations:[{relationId, relationTypeCode, sourceId, targetId, fields}]}`)。
输出 `DiffResult`:

```
objects: {
  added:   [objectId…]                       // 在 B 不在 A
  removed: [objectId…]                        // 在 A 不在 B
  changed: [{ objectId, fields: {
               added:   {code→value},
               removed: {code→oldValue},
               changed: {code→{from,to}} },   // 属性级 diff
             statusChanged?: {from,to} }]
}
relations: { added:[…], removed:[…], changed:[{relationId, fields:{…}, endpointChanged?}] }
summary: { objectsAdded, objectsRemoved, objectsChanged, relationsAdded, … }
```

- 纯函数 `diff(A, B): DiffResult`,确定性、可单测、与 I/O 无关。
- **版本 diff** = 取同一 objectId 两个版本的字段集做属性级 diff(同一引擎,A/B 各一版本)。
- **制品 diff** = A=当前读模型集、B=解析自 JSON 的集(见 §3 导入)。

可选只读端点:`POST /workspaces/{id}/diff`(体内含 A、B 或 "current vs payload"),返回 DiffResult,供前端/交换预览。**不写任何数据。**

## 3. JSON 轻交换(双向,#13)

### 3.1 JSON 制品格式(MVP 自有 schema,非外部标准)
```
{ "version": 1, "workspace": "<id>", "objectType": "<code?>",
  "objects":   [{ "objectTypeCode", "fields": {code→value}, "key?": "<幂等键/外部id>" }],
  "relations": [{ "relationTypeCode", "sourceKey", "targetKey", "fields": {…} }] }
```
（用 `key`/`sourceKey`/`targetKey` 做导入身份对齐,避免依赖内部 UUID;导出时附 key=objectId 或业务键。）

### 3.2 导出(成果输出)
- `GET /workspaces/{id}/exchange/json/export?objectType=` → 由**读模型**(501)拼装上述 JSON 制品并下载。只读。
- 注:完整快照语义(snapshotId,AG-208)属阶段7 正式;MVP 导出当前读模型态,文档注明"当前态导出"。

### 3.3 导入(解析→映射→diff→确认→回写)
- `POST /workspaces/{id}/exchange/json/preview`,体=JSON 制品 → `engines/exchange` 解析+按 key 映射到内部对象/字段/关系 → 与当前读模型集 `diff()` → 返回 `DiffResult`(**预览,不写**)。
- `POST /workspaces/{id}/exchange/json/apply`,体=JSON 制品(或 previewId)+ 确认选项 → server 按 diff 逐项发 **M1 命令**:新增对象→`CreateObject`、字段变更→`UpdateFields`(带 expectedFieldVersion,冲突→KERNEL-409 走确认)、新增关系→`CreateRelation`;**removed 默认不自动删**(需显式确认,避免误删,接 Archive/SoftDelete)。回写全程经命令入口(AG-110),source 标 `import`(信封 source 枚举已含)。
- 冲突:apply 时若字段版本漂移 → KERNEL-409 → 返回未应用项 + 冲突详情,由前端走线框 §4 确认后重试(与表格编辑同一冲突语义)。

## 4. 架构落点

| 模块 | 职责 |
|---|---|
| `engines/exchange`(新子包) | JSON 解析/序列化、key→内部模型映射、`diff()` 纯引擎 | **纯运算,无主数据写、无命令发起、不被 kernel import(AG-108)** |
| `server` | exchange 端点(export/preview/apply)+ diff 端点;apply 时调 `KernelCommandService` 回写 | 写经命令入口(AG-110) |

依赖红线:`engines/exchange → kernel/api + shared`(现有 engines 规则覆盖);server→engines/kernel(已允许)。

## 5. 批次切分(任务卡)

| 卡 | 范围 | 依赖 |
|---|---|---|
| **T-V33-701** | 结构化 diff 纯引擎(engines/exchange)+ `POST /diff` 只读端点 + 全套单测 | 无(纯运算) |
| **T-V33-702** | JSON 制品格式 + export/preview/apply 端点 + 解析/映射 + apply 经 M1 命令回写 | 701(用其 diff)+ 501(读模型导出) |

## 6. 验收口径(MVP-0 13/15)

- **diff(15)**:两数据集 → 准确的对象 added/removed/changed + 属性级 added/removed/changed + 关系 diff;同对象两版本→版本 diff;纯函数全覆盖单测。
- **JSON 交换(13)**:导出当前 demo 数据为 JSON → 改 JSON(改一字段值、加一对象)→ preview 返回正确 diff → apply 经 CreateObject/UpdateFields 回写、读模型刷新可见;字段冲突→KERNEL-409 预览未应用项;**全程 JSON 不作事实源、回写全经命令**。

## 7. 禁止事项(横切)

不实现:ReqIF/XMI/STEP/FMU/docx(阶段7 各独立卡,F.5 不承诺 MVP 全标准);双向自动同步;M2M 转换引擎(BL-02);removed 自动级联删除;深解析 worker(JSON 走轻同步)。交换组不写主数据、不发命令(回写由 server 经命令入口);外部文件不作事实源(AG-507);C 级工具禁入(AG-508);不引入未准入依赖(AG-502)。
