package com.mnext.server;

import com.mnext.engines.exchange.office.ImportMapping;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

record ImportRegisterResponse(UUID importId, String storageKey, String sha256) {}

record ImportTaskView(
    UUID id,
    UUID workspaceId,
    String storageKey,
    String filename,
    String sha256,
    String status,
    ImportMapping mapping,
    ImportResult result,
    String createdBy,
    Instant createdAt) {}

record ImportResult(int created, int skipped, List<ImportRowError> errors) {
  ImportResult {
    errors = errors == null ? List.of() : List.copyOf(errors);
  }
}

record ImportRowError(int rowIndex, String code, String message, Map<String, Object> details) {
  ImportRowError {
    details = details == null ? Map.of() : Map.copyOf(details);
  }
}
