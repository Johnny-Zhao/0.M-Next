package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.UpdateRelationCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class UpdateRelationHandler {
  private final KernelRepository repository;
  private final RelationRepository relations;
  private final PermissionChecker permissionChecker;
  private final CommandSupport support;
  private final RelationCommandSupport relationSupport;

  UpdateRelationHandler(
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
  public CommandResult execute(UpdateRelationCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissionChecker.check(
        "relation.update",
        command.workspaceId(),
        command.relationId(),
        command.fields() == null ? Set.of() : command.fields().keySet(),
        actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), payloadHash);
    if (replay.isPresent()) return replay.get();
    var relation =
        relations
            .lockRelation(command.workspaceId(), command.relationId())
            .orElseThrow(CommandErrors::targetNotFound);
    if (!"ACTIVE".equals(relation.status())) throw CommandErrors.targetNotFound();
    if (relation.version() != command.expectedVersion()) {
      throw CommandErrors.relationVersion(
          relation.id().toString(), command.expectedVersion(), relation.version());
    }
    var type =
        relations
            .relationType(command.workspaceId(), relation.relationTypeId())
            .orElseThrow(CommandErrors::typeNotFound);
    var sourceId = command.sourceId() == null ? relation.sourceId() : command.sourceId();
    var targetId = command.targetId() == null ? relation.targetId() : command.targetId();
    if (type.hierarchical() && endpointsChanged(relation, sourceId, targetId)) {
      relations.deleteClosure(type.id(), relation.sourceId(), relation.targetId());
    }
    relationSupport.validateCandidate(
        command.workspaceId(), relation.relationTypeId(), sourceId, targetId, relation.id());
    var fields = command.fields() == null ? Map.<String, Object>of() : command.fields();
    var fieldsJson = JsonCodec.encode(fields);
    var now = Instant.now();
    var version =
        relations.updateRelation(relation, sourceId, targetId, fieldsJson, actor.id(), now);
    if (type.hierarchical() && endpointsChanged(relation, sourceId, targetId)) {
      relations.insertClosure(type.id(), sourceId, targetId);
    }
    var commandId = CommandSupport.commandId();
    var event =
        EventFactory.relationUpdated(
            command.workspaceId(),
            relation,
            sourceId,
            targetId,
            fields,
            version,
            actor,
            now,
            command.correlationId(),
            commandId);
    repository.insertEvent(event);
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "UpdateRelation",
        payloadHash,
        List.of(event.eventId()),
        now);
  }

  private boolean endpointsChanged(
      RelationRow relation, java.util.UUID sourceId, java.util.UUID targetId) {
    return !relation.sourceId().equals(sourceId) || !relation.targetId().equals(targetId);
  }

  private void validate(UpdateRelationCommand command) {
    if (command.relationId() == null) throw CommandErrors.schema("relationId 必填");
    if (command.expectedVersion() < 1) throw CommandErrors.schema("expectedVersion 必须至少为 1");
    if (command.fields() == null && command.sourceId() == null && command.targetId() == null) {
      throw CommandErrors.schema("fields、sourceId、targetId 至少提供一项");
    }
    if (command.fields() != null && command.fields().size() > 50) {
      throw CommandErrors.schema("fields 最多 50 项");
    }
  }

  private Map<String, Object> payload(UpdateRelationCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("relationId", command.relationId().toString());
    payload.put("expectedVersion", command.expectedVersion());
    if (command.fields() != null) payload.put("fields", command.fields());
    if (command.sourceId() != null) payload.put("sourceId", command.sourceId().toString());
    if (command.targetId() != null) payload.put("targetId", command.targetId().toString());
    return payload;
  }
}
