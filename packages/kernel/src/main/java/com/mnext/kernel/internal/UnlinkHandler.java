package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.UnlinkCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class UnlinkHandler {
  private final KernelRepository repository;
  private final RelationRepository relations;
  private final PermissionChecker permissionChecker;
  private final CommandSupport support;

  UnlinkHandler(
      KernelRepository repository,
      RelationRepository relations,
      PermissionChecker permissionChecker) {
    this.repository = repository;
    this.relations = relations;
    this.permissionChecker = permissionChecker;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  public CommandResult execute(UnlinkCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissionChecker.check(
        "relation.unlink",
        command.workspaceId(),
        command.relationId() == null ? command.relationTypeId() : command.relationId(),
        Set.of(),
        actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), payloadHash);
    if (replay.isPresent()) return replay.get();
    var relation =
        (command.relationId() != null
                ? relations.lockRelation(command.workspaceId(), command.relationId())
                : relations.lockRelation(
                    command.workspaceId(),
                    command.relationTypeId(),
                    command.sourceId(),
                    command.targetId()))
            .orElseThrow(CommandErrors::targetNotFound);
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    if ("UNLINKED".equals(relation.status())) {
      return support.commit(
          command.workspaceId(),
          command.idempotencyKey(),
          commandId,
          "Unlink",
          payloadHash,
          List.of(),
          now);
    }
    if (relation.version() != command.expectedVersion()) {
      throw CommandErrors.relationVersion(
          relation.id().toString(), command.expectedVersion(), relation.version());
    }
    // TODO 阶段3 规则引擎接入派生判定
    var type =
        relations
            .relationType(command.workspaceId(), relation.relationTypeId())
            .orElseThrow(CommandErrors::typeNotFound);
    if (type.hierarchical()) {
      relations.deleteClosure(type.id(), relation.sourceId(), relation.targetId());
    }
    var version = relations.unlink(relation, actor.id(), now);
    var event =
        EventFactory.relationUnlinked(
            command.workspaceId(),
            relation,
            command.reason(),
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
        "Unlink",
        payloadHash,
        List.of(event.eventId()),
        now);
  }

  private void validate(UnlinkCommand command) {
    var byId = command.relationId() != null;
    var byTriple =
        command.relationTypeId() != null
            && command.sourceId() != null
            && command.targetId() != null;
    if (byId == byTriple) throw CommandErrors.schema("relationId 或关系三元组必须且只能提供一种");
    if (command.reason() == null
        || command.reason().isBlank()
        || command.reason().length() > 2000) {
      throw CommandErrors.schema("reason 长度必须为 1..2000");
    }
    if (command.expectedVersion() < 1) throw CommandErrors.schema("expectedVersion 必须至少为 1");
  }

  private Map<String, Object> payload(UnlinkCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    if (command.relationId() != null) payload.put("relationId", command.relationId().toString());
    if (command.sourceId() != null) payload.put("sourceId", command.sourceId().toString());
    if (command.targetId() != null) payload.put("targetId", command.targetId().toString());
    if (command.relationTypeId() != null) {
      payload.put("relationTypeId", command.relationTypeId().toString());
    }
    payload.put("reason", command.reason());
    payload.put("expectedVersion", command.expectedVersion());
    payload.put("acknowledgeImpact", command.acknowledgeImpact());
    return payload;
  }
}
