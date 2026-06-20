package com.mnext.engines.exchange.office;

import java.util.List;

public record ImportMapping(
    Object sheet,
    Integer headerRow,
    String objectTypeCode,
    List<ColumnMapping> columns,
    String keyColumn) {
  public ImportMapping {
    headerRow = headerRow == null ? 0 : headerRow;
    columns = columns == null ? List.of() : List.copyOf(columns);
  }

  public record ColumnMapping(String header, Integer colIndex, String fieldDefCode) {}

  public record ExcelMetadata(List<SheetMetadata> sheets) {
    public ExcelMetadata {
      sheets = sheets == null ? List.of() : List.copyOf(sheets);
    }
  }

  public record SheetMetadata(String name, List<String> headers, int rowCount) {
    public SheetMetadata {
      headers = headers == null ? List.of() : List.copyOf(headers);
    }
  }
}
