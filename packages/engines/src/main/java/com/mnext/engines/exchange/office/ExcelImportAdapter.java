package com.mnext.engines.exchange.office;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.office.ImportMapping.ColumnMapping;
import com.mnext.engines.exchange.office.ImportMapping.ExcelMetadata;
import com.mnext.engines.exchange.office.ImportMapping.SheetMetadata;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

public class ExcelImportAdapter {
  public static final int MAX_IMPORT_ROWS = 5000;
  public static final int MAX_IMPORT_COLS = 200;

  private final DataFormatter formatter = new DataFormatter();

  public ExcelMetadata metadata(InputStream input) {
    try (var workbook = new XSSFWorkbook(input)) {
      var sheets = new ArrayList<SheetMetadata>();
      for (int index = 0; index < workbook.getNumberOfSheets(); index++) {
        var sheet = workbook.getSheetAt(index);
        sheets.add(new SheetMetadata(sheet.getSheetName(), headers(sheet, 0), rowCount(sheet, 0)));
      }
      return new ExcelMetadata(sheets);
    } catch (IOException | RuntimeException failure) {
      throw parseFailed("Excel 元数据解析失败", failure, Map.of());
    }
  }

  public DataSet parse(InputStream input, ImportMapping mapping) {
    validate(mapping);
    try (var workbook = new XSSFWorkbook(input)) {
      var sheet = resolveSheet(workbook, mapping.sheet());
      enforceBounds(sheet, mapping.headerRow());
      var headers = headers(sheet, mapping.headerRow());
      var headerIndex = headerIndex(headers);
      var objects = new ArrayList<DataObject>();
      for (int rowIndex = mapping.headerRow() + 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
        var row = sheet.getRow(rowIndex);
        if (empty(row)) continue;
        objects.add(dataObject(row, rowIndex, mapping, headerIndex));
      }
      return new DataSet(objects, List.of());
    } catch (ImportParseException failure) {
      throw failure;
    } catch (IOException | RuntimeException failure) {
      throw parseFailed("Excel 内容解析失败", failure, Map.of());
    }
  }

  private DataObject dataObject(
      Row row, int rowIndex, ImportMapping mapping, Map<String, Integer> headerIndex) {
    var fields = new LinkedHashMap<String, Object>();
    for (var column : mapping.columns()) {
      var columnIndex = columnIndex(column, headerIndex);
      fields.put(
          column.fieldDefCode(), columnIndex == null ? null : value(row, rowIndex, columnIndex));
    }
    var key = key(row, rowIndex, mapping, headerIndex);
    return new DataObject(key, mapping.objectTypeCode(), fields, "DRAFT", 0);
  }

  private Object value(Row row, int rowIndex, int columnIndex) {
    var cell =
        row == null ? null : row.getCell(columnIndex, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
    if (cell == null) return null;
    if (cell.getCellType() == CellType.ERROR) {
      throw parseFailed(
          "Excel 单元格包含错误值", null, Map.of("row", rowIndex + 1, "column", columnIndex + 1));
    }
    return switch (effectiveType(cell)) {
      case BOOLEAN -> cell.getBooleanCellValue();
      case NUMERIC -> numeric(cell.getNumericCellValue());
      case STRING -> cell.getStringCellValue();
      case BLANK -> null;
      default -> formatter.formatCellValue(cell);
    };
  }

  private String key(
      Row row, int rowIndex, ImportMapping mapping, Map<String, Integer> headerIndex) {
    var keyColumn = mapping.keyColumn();
    if (keyColumn == null || keyColumn.isBlank()) return "row-" + (rowIndex + 1);
    Integer index = headerIndex.get(keyColumn);
    if (index == null) return "row-" + (rowIndex + 1);
    var value = value(row, rowIndex, index);
    return value == null || value.toString().isBlank() ? "row-" + (rowIndex + 1) : value.toString();
  }

  private static void validate(ImportMapping mapping) {
    if (mapping == null
        || mapping.objectTypeCode() == null
        || mapping.objectTypeCode().isBlank()
        || mapping.columns().isEmpty()) {
      throw parseFailed("ImportMapping 缺少 objectTypeCode 或 columns", null, Map.of());
    }
    for (var column : mapping.columns()) {
      if (column.fieldDefCode() == null || column.fieldDefCode().isBlank()) {
        throw parseFailed("ImportMapping.columns.fieldDefCode 必填", null, Map.of());
      }
      if ((column.header() == null || column.header().isBlank()) && column.colIndex() == null) {
        throw parseFailed("ImportMapping.columns 需声明 header 或 colIndex", null, Map.of());
      }
    }
  }

  private static Sheet resolveSheet(XSSFWorkbook workbook, Object sheetRef) {
    if (sheetRef == null) return workbook.getSheetAt(0);
    if (sheetRef instanceof Number number) return workbook.getSheetAt(number.intValue());
    var text = sheetRef.toString();
    try {
      if (text.matches("\\d+")) return workbook.getSheetAt(Integer.parseInt(text));
    } catch (IllegalArgumentException ignored) {
      return missingSheet(text);
    }
    var sheet = workbook.getSheet(text);
    return sheet == null ? missingSheet(text) : sheet;
  }

  private static Sheet missingSheet(String sheet) {
    throw parseFailed("Excel sheet 不存在", null, Map.of("sheet", sheet));
  }

  private void enforceBounds(Sheet sheet, int headerRow) {
    var rows = rowCount(sheet, headerRow);
    if (rows > MAX_IMPORT_ROWS) {
      throw parseFailed("Excel 行数超过上限", null, Map.of("limit", MAX_IMPORT_ROWS, "actual", rows));
    }
    for (Row row : sheet) {
      if (row.getLastCellNum() > MAX_IMPORT_COLS) {
        throw parseFailed(
            "Excel 列数超过上限", null, Map.of("limit", MAX_IMPORT_COLS, "actual", row.getLastCellNum()));
      }
    }
  }

  private List<String> headers(Sheet sheet, int headerRow) {
    var row = sheet.getRow(headerRow);
    if (row == null) return List.of();
    var lastCell = Math.max(0, row.getLastCellNum());
    if (lastCell > MAX_IMPORT_COLS) {
      throw parseFailed("Excel 表头列数超过上限", null, Map.of("limit", MAX_IMPORT_COLS));
    }
    var headers = new ArrayList<String>();
    for (int index = 0; index < lastCell; index++) {
      headers.add(formatter.formatCellValue(row.getCell(index)).trim());
    }
    return headers;
  }

  private static int rowCount(Sheet sheet, int headerRow) {
    return Math.max(0, sheet.getLastRowNum() - headerRow);
  }

  private static Map<String, Integer> headerIndex(List<String> headers) {
    var indexes = new LinkedHashMap<String, Integer>();
    for (int index = 0; index < headers.size(); index++) {
      if (!headers.get(index).isBlank()) indexes.putIfAbsent(headers.get(index), index);
    }
    return indexes;
  }

  private static Integer columnIndex(ColumnMapping column, Map<String, Integer> headerIndex) {
    return column.colIndex() == null ? headerIndex.get(column.header()) : column.colIndex();
  }

  private static boolean empty(Row row) {
    if (row == null) return true;
    for (Cell cell : row) {
      if (cell.getCellType() != CellType.BLANK && !cell.toString().isBlank()) return false;
    }
    return true;
  }

  private static CellType effectiveType(Cell cell) {
    return cell.getCellType() == CellType.FORMULA
        ? cell.getCachedFormulaResultType()
        : cell.getCellType();
  }

  private static Object numeric(double value) {
    if (value == Math.rint(value)) return (long) value;
    return value;
  }

  private static ImportParseException parseFailed(
      String message, Throwable cause, Map<String, Object> details) {
    return new ImportParseException("IMPORT-422-PARSE-FAILED", message, details, cause);
  }

  public static class ImportParseException extends RuntimeException {
    private final String code;
    private final Map<String, Object> details;

    ImportParseException(
        String code, String message, Map<String, Object> details, Throwable cause) {
      super(message, cause);
      this.code = code;
      this.details = Map.copyOf(details);
    }

    public String code() {
      return code;
    }

    public Map<String, Object> details() {
      return details;
    }
  }
}
