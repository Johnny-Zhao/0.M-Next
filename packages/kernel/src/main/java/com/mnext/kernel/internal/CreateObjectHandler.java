package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.RuleChecker;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class CreateObjectHandler {
  private final KernelRepository repository;
  private final MetaModelRepository meta;
  private final PermissionChecker permissionChecker;
  private final RuleChecker ruleChecker;
  private final CommandSupport support;

  CreateObjectHandler(
      KernelRepository repository,
      MetaModelRepository meta,
      PermissionChecker permissionChecker,
      RuleChecker ruleChecker) {
    this.repository = repository;
    this.meta = meta;
    this.permissionChecker = permissionChecker;
    this.ruleChecker = ruleChecker;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  public CommandResult execute(CreateObjectCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissionChecker.check(
        "object.create",
        command.workspaceId(),
        command.objectTypeId(),
        command.fields() == null ? Set.of() : command.fields().keySet(),
        actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), payloadHash);
    if (replay.isPresent()) return replay.get();

    var definitions = meta.resolveEffectiveFields(command.objectTypeId());
    FieldValidator.validate(command, definitions, repository::validReference);
    validateDefinitions(command, definitions);
    enforceUniqueValues(
        command.workspaceId(), command.objectTypeId(), definitions, command.fields(), null);
    enforceRules(
        command.workspaceId(),
        command.objectTypeId(),
        effectiveValues(command, definitions),
        actor);
    var commandId = CommandSupport.commandId();
    var objectId = UUID.randomUUID();
    var now = Instant.now();
    var state = command.initialState() == null ? "DRAFT" : command.initialState();
    repository.insertObject(
        objectId, command.workspaceId(), command.objectTypeId(), state, actor.id(), now);

    var events = new ArrayList<String>();
    var source = CommandSupport.eventSource(command.source().type());
    var created =
        EventFactory.objectCreated(
            command.workspaceId(),
            objectId,
            command.objectTypeId(),
            state,
            actor,
            source,
            now,
            command.correlationId(),
            commandId);
    repository.insertEvent(created);
    events.add(created.eventId());

    command
        .fields()
        .forEach(
            (code, value) -> {
              if (value != null) {
                insertField(
                    command,
                    actor,
                    definitions.get(code),
                    objectId,
                    code,
                    value,
                    now,
                    commandId,
                    events);
              }
            });
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "CreateObject",
        payloadHash,
        events,
        now);
  }

  private void insertField(
      CreateObjectCommand command,
      Actor actor,
      FieldDefinition definition,
      UUID objectId,
      String code,
      Object value,
      Instant now,
      String commandId,
      ArrayList<String> events) {
    repository.insertField(objectId, definition.id(), JsonCodec.encode(value), actor.id(), now);
    var changed =
        EventFactory.fieldChanged(
            command.workspaceId(),
            objectId,
            code,
            null,
            value,
            1,
            actor,
            CommandSupport.eventSource(command.source().type()),
            now,
            command.correlationId(),
            commandId);
    repository.insertEvent(changed);
    events.add(changed.eventId());
  }

  private void validate(CreateObjectCommand command) {
    if (command.objectTypeId() == null || command.fields() == null || command.source() == null) {
      throw CommandErrors.schema("objectTypeId、fields 与 source 必填");
    }
    if (command.fields().size() > 100) throw CommandErrors.schema("fields 最多 100 项");
    if (!Set.of("DRAFT", "PENDING_CONFIRM")
        .contains(command.initialState() == null ? "DRAFT" : command.initialState())) {
      throw CommandErrors.schema("initialState 仅允许 DRAFT 或 PENDING_CONFIRM");
    }
  }

  private void validateDefinitions(
      CreateObjectCommand command, Map<String, FieldDefinition> definitions) {
    if (!repository.objectTypePublished(command.workspaceId(), command.objectTypeId())) {
      throw CommandErrors.typeNotFound();
    }
    for (var code : command.fields().keySet()) {
      if (!definitions.containsKey(code)) throw CommandErrors.schema("未知字段码: " + code);
    }
    definitions.values().stream()
        .filter(FieldDefinition::required)
        .filter(definition -> command.fields().get(definition.code()) == null)
        .findFirst()
        .ifPresent(
            definition -> {
              throw CommandErrors.required(definition.code());
            });
  }

  private void enforceRules(
      UUID workspaceId, UUID objectTypeId, Map<String, Object> effectiveFieldValues, Actor actor) {
    var violations = ruleChecker.check(workspaceId, objectTypeId, effectiveFieldValues, actor);
    var blocking = violations.stream().filter(v -> "BLOCK".equals(v.severity())).toList();
    if (!blocking.isEmpty()) throw CommandErrors.ruleViolation(blocking);
  }

  private void enforceUniqueValues(
      UUID workspaceId,
      UUID objectTypeId,
      Map<String, FieldDefinition> definitions,
      Map<String, Object> fields,
      UUID excludedObjectId) {
    for (var entry : fields.entrySet()) {
      var definition = definitions.get(entry.getKey());
      if (definition == null || !definition.uniqueValue() || entry.getValue() == null) continue;
      var valueJson = JsonCodec.encode(entry.getValue());
      repository.lockUniqueValue(workspaceId, objectTypeId, definition.id(), valueJson);
      if (repository.uniqueValueExists(
          workspaceId, objectTypeId, definition.id(), excludedObjectId, valueJson)) {
        throw CommandErrors.duplicateValue(definition.name(), entry.getValue());
      }
    }
  }

  private Map<String, Object> effectiveValues(
      CreateObjectCommand command, Map<String, FieldDefinition> definitions) {
    var values = new LinkedHashMap<String, Object>();
    for (var code : definitions.keySet()) {
      values.put(code, command.fields().get(code));
    }
    return values;
  }

  private Map<String, Object> payload(CreateObjectCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    var source = new LinkedHashMap<String, Object>();
    source.put("type", command.source().type());
    if (command.source().ref() != null) source.put("ref", command.source().ref());
    payload.put("objectTypeId", command.objectTypeId().toString());
    payload.put("fields", command.fields());
    payload.put("source", source);
    payload.put("initialState", command.initialState() == null ? "DRAFT" : command.initialState());
    return payload;
  }
}
