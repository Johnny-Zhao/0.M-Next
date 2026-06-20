package com.mnext.server;

import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.office.ExcelImportAdapter;
import com.mnext.engines.exchange.office.ExcelImportAdapter.ImportParseException;
import com.mnext.engines.exchange.office.ImportMapping;
import com.mnext.engines.exchange.office.ImportMapping.ExcelMetadata;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.server.storage.StorageBackend;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
class ImportService {
  private static final SourceInfo IMPORT_SOURCE = new SourceInfo("artifact_sync", "excel-import");
  private static final String XLSX_TYPE =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  private final StorageBackend storage;
  private final ImportRepository imports;
  private final ReadModelRepository readModel;
  private final com.mnext.kernel.api.KernelCommandService commands;
  private final ExcelImportAdapter adapter;
  private final long maxBytes;

  ImportService(
      StorageBackend storage,
      ImportRepository imports,
      ReadModelRepository readModel,
      com.mnext.kernel.api.KernelCommandService commands,
      @Value("${mnext.import.max-bytes:52428800}") long maxBytes) {
    this.storage = storage;
    this.imports = imports;
    this.readModel = readModel;
    this.commands = commands;
    this.adapter = new ExcelImportAdapter();
    this.maxBytes = maxBytes;
  }

  ImportRegisterResponse register(
      UUID workspaceId, String actorId, String filename, String contentType, InputStream input)
      throws IOException {
    var normalizedType = normalizeContentType(contentType, filename);
    if (!XLSX_TYPE.equals(normalizedType)) {
      throw error(
          "IMPORT-415-UNSUPPORTED-TYPE",
          "导入文件类型不支持",
          Map.of("contentType", normalizedType),
          "上传 .xlsx 文件");
    }
    try {
      var stored = storage.put(new BoundedInputStream(input, maxBytes), normalizedType);
      var importId = UUID.randomUUID();
      imports.create(
          importId,
          workspaceId,
          stored.storageKey(),
          filename == null || filename.isBlank() ? "import.xlsx" : filename,
          stored.sha256(),
          actorId,
          Instant.now());
      return new ImportRegisterResponse(importId, stored.storageKey(), stored.sha256());
    } catch (TooLargeException failure) {
      throw error("IMPORT-413-TOO-LARGE", "导入文件超过大小上限", Map.of("limit", maxBytes), "压缩或拆分文件后重试");
    }
  }

  ExcelMetadata metadata(UUID workspaceId, UUID importId) throws IOException {
    var task = required(workspaceId, importId);
    try (var input = storage.get(task.storageKey())) {
      return adapter.metadata(input);
    } catch (ImportParseException failure) {
      throw importError(failure);
    }
  }

  ImportResult parse(UUID workspaceId, UUID importId, ImportMapping mapping, String actorId)
      throws IOException {
    validateMapping(mapping);
    var task = required(workspaceId, importId);
    if ("IMPORTED".equals(task.status())) return task.result();
    if (!"REGISTERED".equals(task.status()) && !"FAILED".equals(task.status())) {
      throw error(
          "IMPORT-409-INVALID-STATE",
          "导入任务状态不允许解析",
          Map.of("status", task.status()),
          "使用 REGISTERED 任务重新发起解析");
    }
    try (var input = storage.get(task.storageKey())) {
      var dataSet = adapter.parse(input, mapping);
      var result = applyObjects(workspaceId, importId, dataSet.objects(), actorId);
      imports.imported(workspaceId, importId, mapping, result);
      return result;
    } catch (ImportParseException failure) {
      var result =
          new ImportResult(
              0,
              0,
              java.util.List.of(
                  new ImportRowError(0, failure.code(), failure.getMessage(), failure.details())));
      imports.failed(workspaceId, importId, mapping, result);
      throw importError(failure);
    }
  }

  private ImportResult applyObjects(
      UUID workspaceId, UUID importId, java.util.List<DataObject> objects, String actorId) {
    var errors = new ArrayList<ImportRowError>();
    var created = 0;
    var correlationId = UUID.randomUUID();
    for (int index = 0; index < objects.size(); index++) {
      var object = objects.get(index);
      try {
        commands.createObject(
            new CreateObjectCommand(
                workspaceId,
                correlationId,
                "import:" + importId + ":row:" + index,
                readModel.objectTypeId(workspaceId, object.objectTypeCode()),
                object.fields(),
                IMPORT_SOURCE,
                "DRAFT"),
            Actor.user(actorId));
        created += 1;
      } catch (CommandRejectedException failure) {
        errors.add(rowError(index, failure.error()));
      } catch (RuntimeException failure) {
        errors.add(
            new ImportRowError(
                index,
                "IMPORT-422-PARSE-FAILED",
                failure.getMessage(),
                Map.of("objectKey", object.objectId())));
      }
    }
    return new ImportResult(created, 0, errors);
  }

  private ImportTaskView required(UUID workspaceId, UUID importId) {
    var task = imports.get(workspaceId, importId);
    if (task == null) {
      throw error(
          "IMPORT-404-TASK-NOT-FOUND", "导入任务不存在", Map.of("importId", importId), "刷新导入任务后重试");
    }
    return task;
  }

  private static void validateMapping(ImportMapping mapping) {
    if (mapping == null
        || mapping.objectTypeCode() == null
        || mapping.objectTypeCode().isBlank()
        || mapping.columns().isEmpty()) {
      throw error("IMPORT-400-SCHEMA-INVALID", "导入映射无效", Map.of(), "按 ImportMapping Schema 修正载荷");
    }
  }

  private static ImportRowError rowError(int rowIndex, CommandError error) {
    return new ImportRowError(rowIndex, error.code(), error.message(), error.details());
  }

  private static CommandRejectedException importError(ImportParseException failure) {
    return new CommandRejectedException(
        new CommandError(
            failure.code(), failure.getMessage(), failure.details(), "修正 Excel 或映射后重试"));
  }

  private static CommandRejectedException error(
      String code, String message, Map<String, Object> details, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, details, suggestion));
  }

  private static String normalizeContentType(String contentType, String filename) {
    var type = contentType == null ? "" : contentType.split(";", 2)[0].trim().toLowerCase();
    if (!"application/octet-stream".equals(type) && !type.isBlank()) return type;
    return filename != null && filename.toLowerCase().endsWith(".xlsx") ? XLSX_TYPE : type;
  }

  private static final class BoundedInputStream extends FilterInputStream {
    private final long maxBytes;
    private long count;

    private BoundedInputStream(InputStream input, long maxBytes) {
      super(input);
      this.maxBytes = maxBytes;
    }

    @Override
    public int read() throws IOException {
      var value = super.read();
      if (value != -1) increment(1);
      return value;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
      var read = super.read(buffer, offset, length);
      if (read > 0) increment(read);
      return read;
    }

    private void increment(long delta) throws TooLargeException {
      count += delta;
      if (count > maxBytes) throw new TooLargeException();
    }
  }

  private static final class TooLargeException extends IOException {}
}
