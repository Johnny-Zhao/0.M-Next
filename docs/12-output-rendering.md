# 12 — 成果输出渲染设计稿(阶段9 输出半边)

- 状态:设计稿(Claude 产出,待用户确认 → 转 Codex 任务卡 T-V33-708a;708b 待依赖准入)
- 依据:说明书 §5.10/§6.9/§7.12 成果输出与制品交换、§1097 输出流程、**§1488 输出快照字段**、§1134 重任务后台、§970/§1135 输出为基础能力;AGENTS.md **AG-208**(渲染入参只能 snapshotId)/AG-110/AG-201/AG-502;704 快照、707 适配器 SPI(同构样板)
- 对应:阶段9"成果输出与制品交换"的**输出半边**(交换半边已由 701/702/704/705/707 完成)
- 主线:**把不可变快照按输出模板渲染成交付物(Word/Excel/PDF/数据包),并记可追溯的"输出快照"**;输入只能 snapshotId(AG-208);渲染走**可插的 `RenderAdapter` SPI**——内核内置无依赖参考渲染器,Office 渲染器需依赖准入

---

## 1. 设计原则

1. **AG-208**:渲染器入参**只能是 snapshotId**(来自 704),禁止 workspaceId 直读实时数据。
2. **可追溯**:每次输出落一条"**输出快照**"记录(§1488:输出时间/人、模板及版本、数据范围/口径、审阅状态、检查状态、数据版本、制品版本、**文件哈希**)+ 产物字节。
3. **基础能力**(§970/§1135):输出不依赖 AI/仿真;MVP 小体量同步,大体量后台任务(§1134)留后续。
4. **渲染可插**(呼应 707):`RenderAdapter` SPI;内核内置**无新依赖**参考渲染器;Office 渲染器作需准入的适配器(可核心、可插件)。
5. **依赖纪律(AG-502)**:docx/xlsx=Apache POI、pdf=PDFBox/OpenPDF 是**新依赖**,须经 ADR + `ci/deps-allowlist.yaml` 准入(人决策);**准入前不引、不实现 Office 渲染**。

## 2. 架构

```
snapshotId(704)→ 载入不可变 DataSet → 输出前检查(MVP 最小:记审阅/检查态)
              → RenderAdapter.render(DataSet, 模板) → 产物字节
              → 存产物 + 写 output_snapshot 记录(元数据 §1488 + SHA-256)
              → 返回 outputSnapshotId + 元数据(供下载/分享)
```

### 2.1 RenderAdapter SPI(engines/output,纯)
```java
public interface RenderAdapter {
  String formatId();            // "html" | "markdown" | "csv" | "docx" | "xlsx" | "pdf"
  String mediaType();
  byte[] render(DataSet snapshot, OutputTemplate template);   // 纯:快照+模板→字节,无主数据写/命令
}
```
经 ServiceLoader 注册(同 707);内置 `HtmlRenderAdapter`/`MarkdownRenderAdapter`/`CsvRenderAdapter`(纯 Java,无新依赖)。

### 2.2 输出快照(迁移 V7,落 server)
```
output_snapshot(
  output_id UUID PK, workspace_id UUID, data_snapshot_id UUID,   -- 指向 704 快照
  format VARCHAR, template_id UUID NULL, template_version INT NULL,
  review_status VARCHAR, check_status VARCHAR, data_version BIGINT,
  created_at TIMESTAMPTZ, created_by VARCHAR,
  content_hash CHAR(64), artifact BYTEA )                        -- MVP 产物入库;大文件改对象存储留后续
```

### 2.3 端点(server)
```
POST /workspaces/{id}/outputs  { snapshotId, format, templateId? }
   → 取快照 DataSet → 渲染 → 存产物+输出快照 → 返回 {outputId, format, contentHash, createdAt}
GET  /workspaces/{id}/outputs            → 列表(分页有界)
GET  /workspaces/{id}/outputs/{outputId} → 元数据 + 产物下载
```

## 3. 输出模板(MVP 最小)

- MVP:`OutputTemplate` = 轻描述(选哪些对象类型/字段/分节顺序),由请求带或预置;**不做可视化模板编辑器**(后续/资产库)。
- 模板版本化(§1119)留后续;MVP 记 templateId/version 字段占位。

## 4. 批次切分

| 卡 | 范围 | 依赖 | 依赖准入 |
|---|---|---|---|
| **T-V33-708a** | 渲染管线 + `RenderAdapter` SPI + 内置 **HTML/Markdown/CSV** 渲染器 + 输出快照(V7)+ 端点 | 704、707(SPI 样板) | **无新依赖** |
| T-V33-708b | **Office 渲染器**:docx/xlsx(Apache POI)、pdf(PDFBox/OpenPDF)作 RenderAdapter | 708a | **需 ADR + allowlist 准入(人先决策)** |
| 后续/backlog | 数据包生成(zip 交付物)、输出模板编辑器、完整"未过检查不得输出"门、后台任务化(§1134)、对象存储大产物 | 708a/b | — |

## 5. 依赖准入门(关键,人决策)

708b 需准入:**Apache POI**(docx/xlsx,Apache-2.0)、**PDFBox 或 OpenPDF**(pdf;PDFBox=Apache-2.0,OpenPDF=LGPL/MPL——注意 E2 许可)。流程同 ajv/g6:人发起 ADR-00x + 更新 `ci/deps-allowlist.yaml`,Codex 方可在 708b 引用。**708a 不涉,先跑通管线 + 输出快照闭环。**

## 6. 验收口径(708a)

捕获快照 → `POST /outputs {snapshotId, format:html}` → 得 outputId + contentHash;`GET /outputs/{id}` 返回同字节(产物不可变);输出快照记录含 §1488 关键字段 + hash;渲染器经 ServiceLoader 可插(放一个测试渲染器验证);**输入只接 snapshotId(AG-208),拒 workspaceId 直渲**;渲染纯(无主数据写/命令)。

## 7. 禁止事项

不实现(本阶段):Office 渲染(708b,待准入)、数据包/zip、模板可视化编辑器、完整输出前检查门、后台任务化、对象存储、AI/仿真参与输出;引入任何未准入依赖(AG-502);渲染器写主数据或发命令(AG-110:输出是只读消费快照,不回写主数据);workspaceId 直渲(AG-208)。每步一 commit,完成后停止等待审查。
