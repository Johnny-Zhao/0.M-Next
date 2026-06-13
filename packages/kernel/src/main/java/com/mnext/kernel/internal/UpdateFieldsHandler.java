package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.FieldUpdate;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class UpdateFieldsHandler {
  private final KernelRepository repository;
  private final PermissionChecker permissionChecker;
  private final CommandSupport support;

  UpdateFieldsHandler(KernelRepository repository, PermissionChecker permissionChecker) {
    this.repository = repository;
    this.permissionChecker = permissionChecker;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  public CommandResult execute(UpdateFieldsCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    var codes =
        command.fields() == null
            ? Set.<String>of()
            : command.fields().stream()
                .map(FieldUpdate::fieldDefCode)
                .collect(java.util.stream.Collectors.toSet());
    permissionChecker.check(
        "field.update", command.workspaceId(), command.objectId(), codes, actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), payloadHash);
    if (replay.isPresent()) return replay.get();

    var object =
        repository
            .lockObject(command.workspaceId(), command.objectId())
            .orElseThrow(CommandErrors::targetNotFound);
    if (Set.of("VOID", "FILED", "DELETED").contains(object.status()))
      throw CommandErrors.archived();
    var definitions = repository.fieldDefinitions(object.objectTypeId());
    FieldValidator.validate(command, definitions, repository::validReference);
    var prepared = prepare(command, definitions);
    var conflicts = conflicts(command, object, prepared);
    if (!conflicts.isEmpty()) {
      throw CommandErrors.version(
          command.objectId().toString(),
          command.expectedObjectVersion(),
          object.version(),
          conflicts);
    }

    var commandId = CommandSupport.commandId();
    var now = Instant.now();
    var eventIds = new ArrayList<String>();
    var changedCodes = new ArrayList<String>();
    for (var field : prepared) {
      if (isChanged(field)) {
        applyField(command, actor, field, commandId, now, eventIds);
        changedCodes.add(field.update().fieldDefCode());
      }
    }
    if (!changedCodes.isEmpty()) {
      var objectVersion = repository.incrementObjectVersion(command.objectId(), actor.id(), now);
      var updated =
          EventFactory.objectUpdated(
              command.workspaceId(),
              command.objectId(),
              objectVersion,
              changedCodes,
              actor,
              now,
              command.correlationId(),
              commandId);
      repository.insertEvent(updated);
      eventIds.add(updated.eventId());
    }
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "UpdateFields",
        payloadHash,
        eventIds,
        now);
  }

  private List<PreparedField> prepare(
      UpdateFieldsCommand command, Map<String, FieldDefinition> definitions) {
    var prepared = new ArrayList<PreparedField>();
    for (var update : command.fields()) {
      var definition = definitions.get(update.fieldDefCode());
      if (definition == null) throw CommandErrors.schema("未知字段码: " + update.fieldDefCode());
      var current = repository.lockField(command.objectId(), update.fieldDefCode()).orElse(null);
      prepared.add(new PreparedField(update, definition, current));
    }
    return prepared;
  }

  private List<Map<String, Object>> conflicts(
      UpdateFieldsCommand command, ObjectRow object, List<PreparedField> fields) {
    var conflicts = new ArrayList<Map<String, Object>>();
    for (var field : fields) {
      var expected = field.update().expectedFieldVersion();
      var currentVersion = field.current() == null ? 0 : field.current().version();
      var objectConflict = expected == null && command.expectedObjectVersion() != object.version();
      if (objectConflict || (expected != null && expected != currentVersion)) {
        conflicts.add(conflict(field));
      }
    }
    return conflicts;
  }

  private Map<String, Object> conflict(PreparedField field) {
    var conflict = new LinkedHashMap<String, Object>();
    conflict.put("fieldDefCode", field.update().fieldDefCode());
    conflict.put("yourValue", field.update().value());
    if (field.current() != null) {
      conflict.put("currentValue", JsonCodec.decodeScalar(field.current().valueJson()));
      conflict.put("changedBy", field.current().updatedBy());
      conflict.put("changedAt", field.current().updatedAt().toString());
    }
    return conflict;
  }

  private boolean isChanged(PreparedField field) {
    return field.current() == null
        || !repository.sameJson(
            field.current().valueJson(), JsonCodec.encode(field.update().value()));
  }

  private void applyField(
      UpdateFieldsCommand command,
      Actor actor,
      PreparedField field,
      String commandId,
      Instant now,
      List<String> eventIds) {
    var before =
        field.current() == null ? null : JsonCodec.decodeScalar(field.current().valueJson());
    var version =
        field.current() == null
            ? insertMissing(command, actor, field, now)
            : repository.updateField(
                command.objectId(),
                field.definition().id(),
                JsonCodec.encode(field.update().value()),
                field.current().version(),
                actor.id(),
                now);
    var event =
        EventFactory.fieldChanged(
            command.workspaceId(),
            command.objectId(),
            field.update().fieldDefCode(),
            before,
            field.update().value(),
            version,
            actor,
            "manual",
            now,
            command.correlationId(),
            commandId);
    repository.insertEvent(event);
    eventIds.add(event.eventId());
  }

  private long insertMissing(
      UpdateFieldsCommand command, Actor actor, PreparedField field, Instant now) {
    repository.insertMissingField(
        command.objectId(),
        field.definition().id(),
        JsonCodec.encode(field.update().value()),
        actor.id(),
        now);
    return 1;
  }

  private void validate(UpdateFieldsCommand command) {
    if (command.objectId() == null || command.fields() == null) {
      throw CommandErrors.schema("objectId 与 fields 必填");
    }
    if (command.expectedObjectVersion() < 1) {
      throw CommandErrors.schema("expectedObjectVersion 必须至少为 1");
    }
    if (command.fields().isEmpty() || command.fields().size() > 100) {
      throw CommandErrors.schema("fields 数量必须为 1..100");
    }
    var distinctCodes = command.fields().stream().map(FieldUpdate::fieldDefCode).distinct().count();
    if (distinctCodes != command.fields().size()) throw CommandErrors.schema("fields 不得包含重复字段码");
  }

  private Map<String, Object> payload(UpdateFieldsCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectId", command.objectId().toString());
    payload.put("expectedObjectVersion", command.expectedObjectVersion());
    var fields = new ArrayList<Map<String, Object>>();
    for (var update : command.fields()) {
      var item = new LinkedHashMap<String, Object>();
      item.put("fieldDefCode", update.fieldDefCode());
      item.put("value", update.value());
      if (update.expectedFieldVersion() != null) {
        item.put("expectedFieldVersion", update.expectedFieldVersion());
      }
      fields.add(item);
    }
    payload.put("fields", fields);
    return payload;
  }
}
