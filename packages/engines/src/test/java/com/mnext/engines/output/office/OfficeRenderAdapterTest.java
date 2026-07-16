package com.mnext.engines.output.office;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.output.OutputTemplate;
import com.mnext.engines.output.RenderRegistry;
import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

class OfficeRenderAdapterTest {
  private static final OutputTemplate TEMPLATE =
      new OutputTemplate("demo", List.of("name", "cost"));

  @Test
  void rendersDocxAndPoiReadsObjectFields() throws Exception {
    var bytes = new DocxRenderAdapter().render(dataSet(), TEMPLATE);

    assertZip(bytes);
    try (var document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
      var table = document.getTables().getFirst();
      assertEquals("objectId", table.getRow(0).getCell(0).getText());
      assertEquals("name", table.getRow(0).getCell(1).getText());
      assertEquals("First", table.getRow(1).getCell(1).getText());
      assertEquals("3", table.getRow(1).getCell(2).getText());
    }
  }

  @Test
  void rendersTreeDocxWithHeadingsParametersAndValidationSummary() throws Exception {
    var bytes = new DocxRenderAdapter().render(treeDataSet("BLOCK"), treeTemplate());

    assertZip(bytes);
    try (var document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
      var headings =
          document.getParagraphs().stream()
              .filter(paragraph -> paragraph.getStyle() != null)
              .filter(paragraph -> paragraph.getStyle().startsWith("Heading"))
              .toList();
      assertEquals(
          List.of("技术方案 Demo", "协作系统", "供电模块", "电芯单元"),
          headings.stream().map(paragraph -> paragraph.getText()).toList());
      assertEquals(
          List.of("Heading1", "Heading2", "Heading3", "Heading4"),
          headings.stream().map(paragraph -> paragraph.getStyle()).toList());
      assertHeadingOutlineStyles(document);
      assertTrue(hasParagraph(document, "描述:负责技术方案的供电预算。"));
      assertTrue(hasParagraph(document, "职责:负责电芯单元供电。"));
      assertFalse(hasParagraph(document, "负责技术方案的供电预算。"));
      assertFalse(hasParagraph(document, "负责电芯单元供电。"));
      assertTrue(
          document.getParagraphs().stream()
              .anyMatch(
                  paragraph -> "Recommended for detailed design.".equals(paragraph.getText())));
      assertTrue(hasTableRow(document, "功耗(W)", "920"));
      assertTrue(hasTableRow(document, "power_mode", "双路冗余"));
      assertTrue(hasTableRow(document, "技术方案 Demo", "阻断"));
      assertFalse(
          document.getParagraphs().stream()
              .anyMatch(paragraph -> paragraph.getText().contains("_tree")));
    }
  }

  @Test
  void rendersTreeDocxAllOkValidationSummary() throws Exception {
    var bytes = new DocxRenderAdapter().render(treeDataSet("OK"), treeTemplate());

    assertZip(bytes);
    try (var document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
      assertTrue(hasTableRow(document, "全部校核通过", ""));
    }
  }

  @Test
  void rendersConfiguredRelationTablesFromSnapshotRelations() throws Exception {
    var source = treeDataSet("OK");
    var snapshot =
        new DataSet(
            source.objects(),
            List.of(
                new DataSet.DataRelation(
                    "contains-1", "contains", "proposal", "system", Map.of())));
    var template =
        new OutputTemplate(
            null,
            List.of(),
            new OutputTemplate.SectionMapping(
                Map.of(),
                Map.of(),
                Map.of(),
                List.of(
                    new OutputTemplate.SectionMapping.RelationTable(
                        "contains",
                        "方案明细表",
                        List.of(
                            new OutputTemplate.SectionMapping.RelationColumn(
                                "名称", "name", List.of()))))));

    var bytes = new DocxRenderAdapter().render(snapshot, template);

    try (var document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
      assertTrue(hasParagraph(document, "方案明细表"));
      assertTrue(
          document.getTables().stream()
              .flatMap(table -> table.getRows().stream())
              .anyMatch(row -> "协作系统".equals(row.getCell(0).getText())));
    }
  }

  @Test
  void rendersTreeDocxBodyAfterHeadingWithRichTextAndBullets() throws Exception {
    var bytes = new DocxRenderAdapter().render(treeDataSetWithBody(), treeTemplate());

    assertZip(bytes);
    try (var document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
      assertTrue(
          document.getParagraphs().stream()
              .anyMatch(paragraph -> "正文第一段，含粗体和斜体。".equals(paragraph.getText())));
      var richParagraph =
          document.getParagraphs().stream()
              .filter(paragraph -> "正文第一段，含粗体和斜体。".equals(paragraph.getText()))
              .findFirst()
              .orElseThrow();
      assertTrue(
          richParagraph.getRuns().stream()
              .anyMatch(run -> "粗体".equals(run.text()) && run.isBold()));
      assertEquals(
          2,
          document.getParagraphs().stream()
              .filter(paragraph -> paragraph.getNumID() != null)
              .filter(paragraph -> List.of("第一项", "第二项").contains(paragraph.getText()))
              .count());
      assertFalse(hasTableRow(document, "body", bodyJson()));
      assertTrue(hasTableRow(document, "功耗(W)", "920"));
    }
  }

  @Test
  void badTiptapBodyJsonFallsBackWithoutThrowing() throws Exception {
    var dataSet =
        new DataSet(
            List.of(
                new DataObject(
                    "module",
                    "module",
                    Map.of(
                        "name",
                        "坏正文模块",
                        "body",
                        "{bad-json",
                        "_tree",
                        Map.of("depth", 0, "order", 0, "ruleStatus", "OK")),
                    "ACTIVE",
                    1)),
            List.of());

    var bytes = new DocxRenderAdapter().render(dataSet, treeTemplate());

    try (var document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
      assertTrue(
          document.getParagraphs().stream()
              .anyMatch(paragraph -> "{bad-json".equals(paragraph.getText())));
    }
  }

  @Test
  void treeDocxWithoutBodyKeepsByteStableRegressionBytes() throws Exception {
    var bytes = new DocxRenderAdapter().render(treeDataSet("BLOCK"), treeTemplate());
    var repeated = new DocxRenderAdapter().render(treeDataSet("BLOCK"), treeTemplate());

    assertArrayEquals(bytes, repeated);
  }

  @Test
  void treeHeadingFallsBackToUnnamedWithoutEmittingObjectId() throws Exception {
    var objectId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    var dataSet =
        new DataSet(
            List.of(
                new DataObject(
                    objectId,
                    "proposal",
                    Map.of("_tree", Map.of("depth", 0, "order", 0, "ruleStatus", "OK")),
                    "ACTIVE",
                    1)),
            List.of());

    var bytes = new DocxRenderAdapter().render(dataSet, treeTemplate());

    try (var document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
      var headings =
          document.getParagraphs().stream()
              .filter(paragraph -> paragraph.getStyle() != null)
              .filter(paragraph -> paragraph.getStyle().startsWith("Heading"))
              .map(paragraph -> paragraph.getText())
              .toList();
      assertEquals(List.of("未命名方案"), headings);
      // 文案红线:标题绝不外泄 objectId/UUID。
      assertFalse(
          document.getParagraphs().stream()
              .anyMatch(paragraph -> paragraph.getText().contains(objectId)));
    }
  }

  @Test
  void rendersXlsxAndPoiReadsObjectFields() throws Exception {
    var bytes = new XlsxRenderAdapter().render(dataSet(), TEMPLATE);

    assertZip(bytes);
    try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
      var sheet = workbook.getSheet("Output");
      assertEquals("objectId", sheet.getRow(0).getCell(0).getStringCellValue());
      assertEquals("name", sheet.getRow(0).getCell(1).getStringCellValue());
      assertEquals("First", sheet.getRow(1).getCell(1).getStringCellValue());
      assertEquals("3", sheet.getRow(1).getCell(2).getStringCellValue());
    }
  }

  @Test
  void rendersPdfAndPdfBoxLoadsIt() throws Exception {
    var bytes = new PdfRenderAdapter().render(dataSet(), TEMPLATE);

    assertTrue(new String(bytes, 0, 5, StandardCharsets.US_ASCII).startsWith("%PDF"));
    try (var document = Loader.loadPDF(bytes)) {
      assertTrue(document.getNumberOfPages() >= 1);
    }
  }

  @Test
  void emptyDataSetStillProducesValidArtifacts() throws Exception {
    var empty = new DataSet(List.of(), List.of());

    assertZip(new DocxRenderAdapter().render(empty, new OutputTemplate(null, List.of())));
    assertZip(new XlsxRenderAdapter().render(empty, new OutputTemplate(null, List.of())));
    try (var document =
        Loader.loadPDF(new PdfRenderAdapter().render(empty, new OutputTemplate(null, List.of())))) {
      assertTrue(document.getNumberOfPages() >= 1);
    }
  }

  @Test
  void registryFindsOfficeRenderersAndOfficePackageStaysPure() throws Exception {
    var registry = new RenderRegistry();

    assertEquals("docx", registry.require("docx").formatId());
    assertEquals("xlsx", registry.require("xlsx").formatId());
    assertEquals("pdf", registry.require("pdf").formatId());
    assertOfficePackagePure();
  }

  private static void assertZip(byte[] bytes) {
    assertTrue(bytes.length > 4);
    assertEquals('P', bytes[0]);
    assertEquals('K', bytes[1]);
    assertEquals(3, bytes[2]);
    assertEquals(4, bytes[3]);
  }

  private static void assertHeadingOutlineStyles(XWPFDocument document) {
    var styles = document.getStyles();
    for (var level = 1; level <= 6; level++) {
      var style = styles.getStyle("Heading" + level);
      assertEquals(
          BigInteger.valueOf(level - 1L), style.getCTStyle().getPPr().getOutlineLvl().getVal());
    }
  }

  private static DataSet dataSet() {
    return new DataSet(
        List.of(new DataObject("one", "demo", Map.of("name", "First", "cost", 3), "DRAFT", 1)),
        List.of());
  }

  private static OutputTemplate treeTemplate() {
    return new OutputTemplate(
        null,
        List.of(),
        new OutputTemplate.SectionMapping(
            Map.of(0, 1, 1, 2, 2, 3),
            Map.of("description", "paragraph", "power_mode", "table"),
            Map.of("power_w", "功耗(W)")));
  }

  private static DataSet treeDataSet(String proposalRuleStatus) {
    return new DataSet(
        List.of(
            new DataObject(
                "proposal",
                "proposal",
                Map.of(
                    "title",
                    "技术方案 Demo",
                    "_tree",
                    Map.of("depth", 0, "order", 0, "ruleStatus", proposalRuleStatus)),
                "ACTIVE",
                1),
            new DataObject(
                "system",
                "system",
                Map.of("name", "协作系统", "_tree", Map.of("depth", 1, "order", 1, "ruleStatus", "OK")),
                "ACTIVE",
                1),
            new DataObject(
                "module",
                "module",
                Map.of(
                    "name",
                    "供电模块",
                    "description",
                    "负责技术方案的供电预算。",
                    "conclusion",
                    "Recommended for detailed design.",
                    "power_w",
                    920,
                    "power_mode",
                    "双路冗余",
                    "_tree",
                    Map.of("depth", 2, "order", 2, "ruleStatus", "OK")),
                "ACTIVE",
                1),
            new DataObject(
                "cell",
                "module",
                Map.of(
                    "name",
                    "电芯单元",
                    "responsibility",
                    "负责电芯单元供电。",
                    "_tree",
                    Map.of("depth", 3, "order", 3, "ruleStatus", "OK")),
                "ACTIVE",
                1)),
        List.of());
  }

  private static DataSet treeDataSetWithBody() {
    return new DataSet(
        List.of(
            new DataObject(
                "module",
                "module",
                Map.of(
                    "name",
                    "正文模块",
                    "body",
                    bodyJson(),
                    "power_w",
                    920,
                    "_tree",
                    Map.of("depth", 0, "order", 0, "ruleStatus", "OK")),
                "ACTIVE",
                1)),
        List.of());
  }

  private static String bodyJson() {
    return """
        {"type":"doc","content":[
          {"type":"paragraph","content":[
            {"type":"text","text":"正文第一段，含"},
            {"type":"text","text":"粗体","marks":[{"type":"bold"}]},
            {"type":"text","text":"和"},
            {"type":"text","text":"斜体","marks":[{"type":"italic"}]},
            {"type":"text","text":"。"}]},
          {"type":"bulletList","content":[
            {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"第一项"}]}]},
            {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"第二项"}]}]}]}]}
        """;
  }

  private static boolean hasTableRow(XWPFDocument document, String firstCell, String secondCell) {
    return document.getTables().stream()
        .flatMap(table -> table.getRows().stream())
        .anyMatch(
            row ->
                row.getTableCells().size() >= 2
                    && firstCell.equals(row.getCell(0).getText())
                    && secondCell.equals(row.getCell(1).getText()));
  }

  private static boolean hasParagraph(XWPFDocument document, String text) {
    return document.getParagraphs().stream()
        .anyMatch(paragraph -> text.equals(paragraph.getText()));
  }

  private static void assertOfficePackagePure() throws Exception {
    var root = Path.of("src/main/java/com/mnext/engines/output/office");
    var source = new StringBuilder();
    try (var files = Files.walk(root)) {
      for (var file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
        source.append(Files.readString(file));
      }
    }
    var text = source.toString().toLowerCase();
    assertFalse(text.contains("org.springframework"));
    assertFalse(text.contains("java.sql"));
    assertFalse(text.contains("kernelcommandservice"));
    assertFalse(text.contains("insert into"));
    assertFalse(text.contains("update "));
    assertFalse(text.contains("delete from"));
  }
}
