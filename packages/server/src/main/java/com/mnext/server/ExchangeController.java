package com.mnext.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.AdapterRegistry;
import com.mnext.engines.exchange.ArtifactMapper;
import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import com.mnext.engines.exchange.DiffResult;
import com.mnext.engines.exchange.JsonArtifact;
import com.mnext.engines.exchange.JsonCodec;
import com.mnext.engines.exchange.StructuredDiff;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.FieldUpdate;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ExchangeController {
  private static final SourceInfo IMPORT_SOURCE = new SourceInfo("artifact_sync", "import");
  private final ReadModelRepository readModel;
  private final SnapshotRepository snapshots;
  private final KernelCommandService commands;
  private final JsonCodec codec;
  private final AdapterRegistry adapters;

  public ExchangeController(
      ReadModelRepository readModel, KernelCommandService commands, ObjectMapper mapper) {
    this(readModel, commands, mapper, (SnapshotRepository) null);
  }

  @Autowired
  public ExchangeController(
      ReadModelRepository readModel,
      KernelCommandService commands,
      ObjectMapper mapper,
      ObjectProvider<SnapshotRepository> snapshotProvider) {
    this(readModel, commands, mapper, snapshotProvider.getIfAvailable());
  }

  private ExchangeController(
      ReadModelRepository readModel,
      KernelCommandService commands,
      ObjectMapper mapper,
      SnapshotRepository snapshots) {
    this.readModel = readModel;
    this.commands = commands;
    this.codec = new JsonCodec(mapper);
    this.snapshots = snapshots;
    this.adapters = new AdapterRegistry();
  }

  @GetMapping("/workspaces/{workspaceId}/exchange/json/export")
  public JsonArtifact export(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "objectType", required = false) String objectType) {
    return ArtifactMapper.toArtifact(
        workspaceId.toString(), objectType, readModel.dataSet(workspaceId));
  }

  @GetMapping("/workspaces/{workspaceId}/exchange/{format}/export")
  public ResponseEntity<String> exportGeneric(
      @PathVariable("workspaceId") UUID workspaceId,
      @PathVariable("format") String format,
      @RequestParam(value = "base", defaultValue = "current") String base,
      @RequestParam(value = "objectType", required = false) String objectType) {
    var adapter = adapters.require(format);
    var payload =
        adapter.exportFromDataSet(
            workspaceId.toString(), objectType, previewBase(workspaceId, base));
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(adapter.mediaType()))
        .body(payload);
  }

  @GetMapping(
      value = "/workspaces/{workspaceId}/exchange/reqif/export",
      produces = MediaType.APPLICATION_XML_VALUE)
  public String exportReqIf(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "base", defaultValue = "current") String base,
      @RequestParam(value = "objectType", required = false) String objectType) {
    return exportGeneric(workspaceId, "reqif", base, objectType).getBody();
  }

  @PostMapping("/workspaces/{workspaceId}/exchange/json/preview")
  public DiffResult preview(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "base", defaultValue = "current") String base,
      @RequestBody String json) {
    var current = previewBase(workspaceId, base);
    var artifact = artifact(workspaceId, json);
    return StructuredDiff.diff(current, ArtifactMapper.toDataSet(artifact, current));
  }

  public DiffResult preview(UUID workspaceId, String json) {
    return preview(workspaceId, "current", json);
  }

  @PostMapping("/workspaces/{workspaceId}/exchange/{format}/preview")
  public DiffResult previewGeneric(
      @PathVariable("workspaceId") UUID workspaceId,
      @PathVariable("format") String format,
      @RequestParam(value = "base", defaultValue = "current") String base,
      @RequestBody String payload) {
    var current = previewBase(workspaceId, base);
    return StructuredDiff.diff(current, adapters.require(format).importToDataSet(payload, current));
  }

  @PostMapping("/workspaces/{workspaceId}/exchange/reqif/preview")
  public DiffResult previewReqIf(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "base", defaultValue = "current") String base,
      @RequestBody String reqif) {
    return previewGeneric(workspaceId, "reqif", base, reqif);
  }

  @PostMapping("/workspaces/{workspaceId}/exchange/json/apply")
  public ExchangeApplyResult apply(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody ExchangeApplyRequest request) {
    if (request == null || request.artifact() == null) {
      throw new IllegalArgumentException("artifact 必填");
    }
    if (request.confirmRemovals()) {
      throw new IllegalArgumentException("本批次不支持 removed 自动删除");
    }
    return apply(workspaceId, Actor.user(actorId), request.artifact());
  }

  @PostMapping("/workspaces/{workspaceId}/exchange/{format}/apply")
  public ExchangeApplyResult applyGeneric(
      @PathVariable("workspaceId") UUID workspaceId,
      @PathVariable("format") String format,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody GenericExchangeApplyRequest request) {
    if (request == null || request.payload() == null || request.payload().isBlank()) {
      throw new IllegalArgumentException("payload 必填");
    }
    if (request.confirmRemovals()) {
      throw new IllegalArgumentException("本批次不支持 removed 自动删除");
    }
    return applyPayload(workspaceId, Actor.user(actorId), format, request.payload());
  }

  @PostMapping("/workspaces/{workspaceId}/exchange/reqif/apply")
  public ExchangeApplyResult applyReqIf(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody ReqIfApplyRequest request) {
    if (request == null || request.reqif() == null || request.reqif().isBlank()) {
      throw new IllegalArgumentException("reqif 必填");
    }
    if (request.confirmRemovals()) {
      throw new IllegalArgumentException("本批次不支持 removed 自动删除");
    }
    return applyPayload(workspaceId, Actor.user(actorId), "reqif", request.reqif());
  }

  private JsonArtifact artifact(UUID workspaceId, String json) {
    var artifact = codec.parse(json);
    if (artifact.workspace() != null && !workspaceId.toString().equals(artifact.workspace())) {
      throw new IllegalArgumentException("artifact workspace 与路径不一致");
    }
    return artifact;
  }

  private DataSet previewBase(UUID workspaceId, String base) {
    if ("current".equals(base)) return readModel.dataSet(workspaceId);
    if (base != null && base.startsWith("snapshot:") && snapshots != null) {
      var snapshotId = UUID.fromString(base.substring("snapshot:".length()));
      return snapshots.get(workspaceId, snapshotId).payload();
    }
    throw new IllegalArgumentException("base 仅支持 current 或 snapshot:{id}");
  }

  private ExchangeApplyResult apply(UUID workspaceId, Actor actor, JsonArtifact artifact) {
    if (artifact.workspace() != null && !workspaceId.toString().equals(artifact.workspace())) {
      throw new IllegalArgumentException("artifact workspace 与路径不一致");
    }
    var current = readModel.dataSet(workspaceId);
    var target = ArtifactMapper.toDataSet(artifact, current);
    return applyDataSet(workspaceId, actor, current, target);
  }

  private ExchangeApplyResult applyPayload(
      UUID workspaceId, Actor actor, String format, String payload) {
    var current = readModel.dataSet(workspaceId);
    return applyDataSet(
        workspaceId, actor, current, adapters.require(format).importToDataSet(payload, current));
  }

  private ExchangeApplyResult applyDataSet(
      UUID workspaceId, Actor actor, DataSet current, DataSet target) {
    var diff = StructuredDiff.diff(current, target);
    var applied = new ArrayList<String>();
    var unapplied = new ArrayList<ExchangeApplyFailure>();
    var objectIds = objectIds(current);
    var targetObjects = byObjectId(target);
    var correlationId = UUID.randomUUID();

    for (var key : diff.objects().added()) {
      applyObject(
          workspaceId,
          actor,
          correlationId,
          key,
          targetObjects.get(key),
          objectIds,
          applied,
          unapplied);
    }
    for (var change : diff.objects().changed()) {
      applyFields(workspaceId, actor, correlationId, change, current, applied, unapplied);
    }
    var targetRelations = byRelationId(target);
    for (var key : diff.relations().added()) {
      applyRelation(
          workspaceId,
          actor,
          correlationId,
          key,
          targetRelations.get(key),
          objectIds,
          applied,
          unapplied);
    }
    return new ExchangeApplyResult(diff, List.copyOf(applied), List.copyOf(unapplied));
  }

  private void applyObject(
      UUID workspaceId,
      Actor actor,
      UUID correlationId,
      String key,
      DataObject object,
      Map<String, UUID> objectIds,
      List<String> applied,
      List<ExchangeApplyFailure> unapplied) {
    try {
      var command =
          new CreateObjectCommand(
              workspaceId,
              correlationId,
              idempotency(correlationId, "object", key),
              readModel.objectTypeId(workspaceId, object.objectTypeCode()),
              object.fields(),
              IMPORT_SOURCE,
              "DRAFT");
      var result = commands.createObject(command, actor);
      objectIds.put(key, readModel.createdObjectId(result.events()));
      applied.add("object:" + key);
    } catch (CommandRejectedException failure) {
      unapplied.add(new ExchangeApplyFailure("object:" + key, failure.error()));
    } catch (RuntimeException failure) {
      unapplied.add(new ExchangeApplyFailure("object:" + key, schemaError(failure.getMessage())));
    }
  }

  private void applyFields(
      UUID workspaceId,
      Actor actor,
      UUID correlationId,
      DiffResult.ChangedObject change,
      DataSet current,
      List<String> applied,
      List<ExchangeApplyFailure> unapplied) {
    var currentObject =
        current.objects().stream()
            .filter(value -> value.objectId().equals(change.objectId()))
            .findFirst()
            .orElseThrow();
    var updates = new ArrayList<FieldUpdate>();
    change.fields().added().forEach((code, value) -> updates.add(new FieldUpdate(code, value, 0L)));
    change
        .fields()
        .changed()
        .forEach(
            (code, value) ->
                updates.add(new FieldUpdate(code, value.to(), currentObject.version())));
    if (updates.isEmpty()) return;
    var item = "object:" + change.objectId() + ":fields";
    try {
      commands.updateFields(
          new UpdateFieldsCommand(
              workspaceId,
              correlationId,
              idempotency(correlationId, "fields", change.objectId()),
              UUID.fromString(change.objectId()),
              currentObject.version(),
              updates),
          actor);
      applied.add(item);
    } catch (CommandRejectedException failure) {
      unapplied.add(new ExchangeApplyFailure(item, failure.error()));
    } catch (RuntimeException failure) {
      unapplied.add(new ExchangeApplyFailure(item, schemaError(failure.getMessage())));
    }
  }

  private void applyRelation(
      UUID workspaceId,
      Actor actor,
      UUID correlationId,
      String key,
      DataRelation relation,
      Map<String, UUID> objectIds,
      List<String> applied,
      List<ExchangeApplyFailure> unapplied) {
    var item = "relation:" + key;
    try {
      commands.createRelation(
          new CreateRelationCommand(
              workspaceId,
              correlationId,
              idempotency(correlationId, "relation", key),
              readModel.relationTypeId(workspaceId, relation.relationTypeCode()),
              requiredId(objectIds, relation.sourceId()),
              requiredId(objectIds, relation.targetId()),
              relation.fields(),
              IMPORT_SOURCE),
          actor);
      applied.add(item);
    } catch (CommandRejectedException failure) {
      unapplied.add(new ExchangeApplyFailure(item, failure.error()));
    } catch (RuntimeException failure) {
      unapplied.add(new ExchangeApplyFailure(item, schemaError(failure.getMessage())));
    }
  }

  private static Map<String, UUID> objectIds(DataSet dataSet) {
    var ids = new HashMap<String, UUID>();
    for (var object : dataSet.objects()) {
      ids.put(object.objectId(), UUID.fromString(object.objectId()));
    }
    return ids;
  }

  private static Map<String, DataObject> byObjectId(DataSet dataSet) {
    var values = new LinkedHashMap<String, DataObject>();
    for (var object : dataSet.objects()) values.put(object.objectId(), object);
    return values;
  }

  private static Map<String, DataRelation> byRelationId(DataSet dataSet) {
    var values = new LinkedHashMap<String, DataRelation>();
    for (var relation : dataSet.relations()) values.put(relation.relationId(), relation);
    return values;
  }

  private static UUID requiredId(Map<String, UUID> ids, String key) {
    var value = ids.get(key);
    if (value == null) throw new IllegalArgumentException("未解析对象 key: " + key);
    return value;
  }

  private static String idempotency(UUID correlationId, String kind, String key) {
    return correlationId + ":" + kind + ":" + Integer.toHexString(key.hashCode());
  }

  static CommandError schemaError(String message) {
    return new CommandError("KERNEL-400-SCHEMA-INVALID", message, Map.of(), "修正 JSON 制品或类型映射后重试");
  }
}
