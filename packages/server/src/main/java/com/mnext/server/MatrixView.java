package com.mnext.server;

import java.util.List;
import java.util.Map;
import java.util.UUID;

record MatrixView(
    List<MatrixObject> rows,
    List<MatrixObject> cols,
    List<MatrixCell> cells,
    long rowTotal,
    long colTotal) {
  record MatrixObject(UUID objectId, String label, String status) {}

  record MatrixCell(
      UUID rowId, UUID colId, UUID relationId, String status, Map<String, Object> fields) {}
}
