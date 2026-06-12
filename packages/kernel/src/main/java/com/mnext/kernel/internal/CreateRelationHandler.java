package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class CreateRelationHandler {
  private final KernelRepository repository;
  private final RelationRepository relations;
  private final PermissionChecker permissionChecker;
  private final CommandSupport support;
  private final RelationCommandSupport relationSupport;

  CreateRelationHandler(
      KernelRepository repository,
      RelationRepository relations,
      PermissionChecker permissionChecker) {
    this.repository = repository;
    this.relations = relations;
    this.permissionChecker = permissionChecker;
    this.support = new CommandSupport(repository);
    this.relationSupport = new RelationCommandSupport(relations);
  }

  @Transactional
  public CommandResult execute(CreateRelationCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissionChecker.check(
        "relation.create", command.workspaceId(), command.relationTypeId(), Set.of(), actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), payloadHash);
    if (replay.isPresent()) return replay.get();
    var relationId = UUID.randomUUID();
    var validation =
        relationSupport.validateCandidate(
            command.workspaceId(),
            command.relationTypeId(),
            command.sourceId(),
            command.targetId(),
            relationId);
    var now = Instant.now();
    var fields =
        command.relationFields() == null ? Map.<String, Object>of() : command.relationFields();
    if (!relations.insertRelation(
        relationId,
        command.workspaceId(),
        command.relationTypeId(),
        command.sourceId(),
        command.targetId(),
        JsonCodec.encode(fields),
        actor.id(),
        now)) {
      var existing =
          relations
              .findActive(
                  command.workspaceId(),
                  command.relationTypeId(),
                  command.sourceId(),
                  command.targetId())
              .orElseThrow();
      throw CommandErrors.duplicateRelation(existing.id().toString());
    }
    if (validation.type().hierarchical()) {
      relations.insertClosure(command.relationTypeId(), command.sourceId(), command.targetId());
    }
    var commandId = CommandSupport.commandId();
    var event =
        EventFactory.relationCreated(
            command.workspaceId(),
            relationId,
            command.relationTypeId(),
            command.sourceId(),
            command.targetId(),
            fields,
            actor,
            CommandSupport.eventSource(command.source().type()),
            now,
            command.correlationId(),
            commandId);
    repository.insertEvent(event);
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "CreateRelation",
        payloadHash,
        List.of(event.eventId()),
        now);
  }

  private void validate(CreateRelationCommand command) {
    if (command.relationTypeId() == null
        || command.sourceId() == null
        || command.targetId() == null
        || command.source() == null) {
      throw CommandErrors.schema("relationTypeId、sourceId、targetId 与 source 必填");
    }
    if (command.relationFields() != null && command.relationFields().size() > 50) {
      throw CommandErrors.schema("relationFields 最多 50 项");
    }
  }

  private Map<String, Object> payload(CreateRelationCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("relationTypeId", command.relationTypeId().toString());
    payload.put("sourceId", command.sourceId().toString());
    payload.put("targetId", command.targetId().toString());
    payload.put("relationFields", command.relationFields());
    payload.put("source", Map.of("type", command.source().type()));
    return payload;
  }
}
