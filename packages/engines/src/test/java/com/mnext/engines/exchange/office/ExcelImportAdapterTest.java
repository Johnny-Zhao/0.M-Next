package com.mnext.engines.exchange.office;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.mnext.engines.exchange.office.ExcelImportAdapter.ImportParseException;
import com.mnext.engines.exchange.office.ImportMapping.ColumnMapping;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class ExcelImportAdapterTest {
  private final ExcelImportAdapter adapter = new ExcelImportAdapter();

  @Test
  void metadataAndParseRowsThroughMapping() throws Exception {
    var bytes = workbookBytes();
    var metadata = adapter.metadata(new ByteArrayInputStream(bytes));
    assertEquals(2, metadata.sheets().size());
    assertEquals(List.of("Name", "Cost", "Owner"), metadata.sheets().getFirst().headers());
    assertEquals(3, metadata.sheets().getFirst().rowCount());

    var dataSet =
        adapter.parse(
            new ByteArrayInputStream(bytes),
            new ImportMapping(
                "Objects",
                0,
                "demo_object",
                List.of(
                    new ColumnMapping("Name", null, "name"),
                    new ColumnMapping("Cost", null, "cost"),
                    new ColumnMapping("Missing", null, "owner")),
                "Name"));

    assertEquals(2, dataSet.objects().size());
    assertEquals("demo_object", dataSet.objects().getFirst().objectTypeCode());
    assertEquals("Pump", dataSet.objects().getFirst().objectId());
    assertEquals(12L, dataSet.objects().getFirst().fields().get("cost"));
    assertEquals(null, dataSet.objects().getFirst().fields().get("owner"));
    assertEquals(0, dataSet.relations().size());
  }

  @Test
  void rejectsBadMappingAndSheetBounds() throws Exception {
    var badMapping =
        assertThrows(
            ImportParseException.class,
            () ->
                adapter.parse(
                    new ByteArrayInputStream(workbookBytes()),
                    new ImportMapping("Objects", 0, "", List.of(), null)));
    assertEquals("IMPORT-422-PARSE-FAILED", badMapping.code());

    var tooWide =
        assertThrows(
            ImportParseException.class,
            () ->
                adapter.parse(
                    new ByteArrayInputStream(wideWorkbookBytes()),
                    new ImportMapping(
                        "Wide",
                        0,
                        "demo_object",
                        List.of(new ColumnMapping("C0", null, "name")),
                        "C0")));
    assertEquals("IMPORT-422-PARSE-FAILED", tooWide.code());
  }

  private static byte[] workbookBytes() throws IOException {
    try (var workbook = new XSSFWorkbook();
        var output = new ByteArrayOutputStream()) {
      var sheet = workbook.createSheet("Objects");
      var header = sheet.createRow(0);
      header.createCell(0).setCellValue("Name");
      header.createCell(1).setCellValue("Cost");
      header.createCell(2).setCellValue("Owner");
      var first = sheet.createRow(1);
      first.createCell(0).setCellValue("Pump");
      first.createCell(1).setCellValue(12);
      sheet.createRow(2);
      var second = sheet.createRow(3);
      second.createCell(0).setCellValue("Valve");
      second.createCell(1).setCellValue(3.5);
      workbook.createSheet("Other").createRow(0).createCell(0).setCellValue("Ignored");
      workbook.write(output);
      return output.toByteArray();
    }
  }

  private static byte[] wideWorkbookBytes() throws IOException {
    try (var workbook = new XSSFWorkbook();
        var output = new ByteArrayOutputStream()) {
      var sheet = workbook.createSheet("Wide");
      var row = sheet.createRow(0);
      for (int index = 0; index <= ExcelImportAdapter.MAX_IMPORT_COLS; index++) {
        row.createCell(index).setCellValue("C" + index);
      }
      workbook.write(output);
      return output.toByteArray();
    }
  }
}
