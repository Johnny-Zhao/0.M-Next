package com.mnext.engines.output.office;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.output.OutputTemplate;
import com.mnext.engines.output.RenderRegistry;
import java.io.ByteArrayInputStream;
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

  private static DataSet dataSet() {
    return new DataSet(
        List.of(new DataObject("one", "demo", Map.of("name", "First", "cost", 3), "DRAFT", 1)),
        List.of());
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
