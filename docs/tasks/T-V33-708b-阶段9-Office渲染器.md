# 任务卡 T-V33-708b — 阶段9 输出批2:Office 渲染器(docx/xlsx/pdf)

- 状态:**可下发**(依赖已准入:ADR-010 + allowlist 的 poi-ooxml/poi/pdfbox 已在 main;无内核契约门、无迁移)
- 分支:`feat/T-V33-708b-office-renderers`(从最新 main 切出,AG-401)
- PR 要求:`Spec-Ref: 说明书 §5.10/§7.12 成果输出、§1488 输出快照, docs/12-output-rendering.md §2/§5, ADR-010, AGENTS.md AG-208/AG-502/ADR-008` + AG-405 自检输出段
- 依据:`docs/12-output-rendering.md`;**ADR-010(依赖准入)**;承 708a(管线 + RenderAdapter SPI)
- 对应:阶段9 输出半边——真·Office 交付物
- 排期:依赖 708a(管线/SPI)、ADR-010(已合 main)

## 目标

在 708a 的 `RenderAdapter` SPI 上**新增三个 Office 渲染器**:`DocxRenderAdapter`(POI XWPF)、`XlsxRenderAdapter`(POI XSSF)、`PdfRenderAdapter`(PDFBox),把快照 DataSet 渲成 docx/xlsx/pdf 字节。**只新增适配器 + 受准入依赖;708a 管线/输出快照/AG-208 不改。**

## 涉及文件(封闭清单)

- **修改** `packages/engines/pom.xml`:**新增依赖** `org.apache.poi:poi-ooxml`、`org.apache.pdfbox:pdfbox`(版本在父 POM/BOM 锁定;仅 engines)。**不加 ADR-010 未列的库。**
- **新增** `packages/engines/src/main/java/com/mnext/engines/output/office/`:`DocxRenderAdapter`、`XlsxRenderAdapter`、`PdfRenderAdapter`(各实现 `RenderAdapter`;formatId=docx/xlsx/pdf;mediaType 对应 OOXML/pdf;`render(DataSet, OutputTemplate)` → byte[])。复用 708a `RenderSupport`/`OutputTemplate`。
- **修改** `packages/engines/src/main/resources/META-INF/services/com.mnext.engines.output.RenderAdapter`:追加三个 Office 渲染器。
- **修改** `ci/deps-allowlist.yaml`:**补全 POI/PDFBox 的传递依赖**(build 解析出的全部:如 xmlbeans、commons-compress、commons-io、commons-collections4、commons-math3、log4j-api、SparseBitSet、curvesapi、fontbox 等——以实际 `mvn dependency:tree` 为准,逐一登记;ADR-010 要求)。
- **新增** 测试:engines `OfficeRenderAdapterTest`(docx/xlsx 字节为 ZIP(PK 头)且 POI 可回读到对象字段;pdf 以 `%PDF` 开头且 PDFBox 可加载)。
- **不改** 708a 管线(OutputSnapshotRepository/OutputController/V7)、kernel/shared/views/web、契约、AGENTS、迁移。

## 行为要求(逐条可测)

1. **docx**:XWPF 生成——文档标题 + 按 OutputTemplate 的对象/字段渲为段落或表格;返回非空字节,ZIP/OOXML 结构合法(POI 可重新打开)。
2. **xlsx**:XSSF 生成——一个 sheet,行=对象、列=字段(按 template 字段序);POI 可回读首行表头与某单元格值。
3. **pdf**:PDFBox 生成——标题 + 对象/字段文本流(基础排版即可);字节以 `%PDF-` 开头,PDFBox 可加载、页数≥1。
4. **接管线**:三者经 ServiceLoader 注册后,`POST /outputs {format: docx|xlsx|pdf}` 自动可用(708a 管线零改),输出快照照记 hash;**AG-208 仍只接 snapshotId**(708a 已保证)。
5. **纯**:渲染器仍在 engines/output(office 子包),无 Spring/JDBC/命令(`OutputArchitectureTest` 仍须覆盖/通过——POI/PDFBox 是渲染库,非 spring/jdbc,允许)。
6. **多架构/离线(ADR-008)**:POI/PDFBox 纯 Java 无 native;不得引入带 native 的可选依赖。

## 测试要求(jacoco ≥0.80;AG-504 禁 sleep)

engines `OfficeRenderAdapterTest`:对一个 DataSet,docx/xlsx 产出 ZIP(`PK\x03\x04` 头)且用 POI 回读校验至少一个对象的字段值;pdf 产出 `%PDF` 且 PDFBox `Loader.loadPDF` 成功、页数≥1;空 DataSet 不抛、产出合法空文档。架构断言:office 子包无 spring/jdbc/sql/命令。可经 RenderRegistry 取到 docx/xlsx/pdf 三 formatId。

## 验收标准(机器可判)

1. `pnpm verify` 全绿(贴 jacoco;集成测试 Skipped:0,需 Docker);2. **`pnpm architecture:check` / 依赖门通过**——POI/PDFBox **及其传递依赖**全部在 allowlist(否则补全);3. 演示链:建快照 → `POST /outputs {snapshotId, format:docx}`(及 xlsx/pdf)→ 下载得可被 Word/Excel/PDF 阅读器打开的文件、输出快照含 hash;4. `git diff --stat main` 限封闭清单(708a 管线零改);5. PR 含 AG-405 自检 + `mvn dependency:tree` 摘要(证明传递依赖已登记)。

## 禁止事项

禁止实现:数据包/zip 打包、模板可视化编辑器、富排版/样式主题、图表嵌入、后台任务化、对象存储;引入 ADR-010 未准入的库(如 OpenPDF/iText)、带 native 的库;改 708a 管线/输出快照/AG-208 语义、kernel/shared/views/web、迁移、契约、AGENTS。渲染器只读消费快照、不写主数据、不发命令。

## 给 Codex 的落盘自检(防截断)

每个新增 `.java` 落盘后:大括号配平 + 完整闭合;spotless:apply 不报 EOF;编译过再跑测试。**特别**:加完 pom 依赖先 `mvn -o dependency:tree`(或在线一次)确认传递依赖,逐一补进 allowlist,再确保 `architecture:check`/依赖门过。每步一 commit,完成后停止等待审查。
