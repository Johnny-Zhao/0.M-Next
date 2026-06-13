package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.SoftDeleteCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class SoftDeleteHandler {
  private final KernelRepository repository;
  private final RelationRepository relations;
  private final ArchiveHandler archiveHandler;
  private final PermissionChecker permissionChecker;
  private final CommandSupport support;

  SoftDeleteHandler(
      KernelRepository repository,
      RelationRepository relations,
      ArchiveHandler archiveHandler,
      PermissionChecker permissionChecker) {
    this.repository = repository;
    this.relations = relations;
    this.archiveHandler = archiveHandler;
    this.permissionChecker = permissionChecker;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  public CommandResult execute(SoftDeleteCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissionChecker.check(
        "softdelete.execute", command.workspaceId(), command.targetId(), Set.of(), actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), payloadHash);
    if (replay.isPresent()) return replay.get();
    var commandId = CommandSupport.commandId();
    var now = Instant.now();
    return "object".equals(command.targetType())
        ? deleteObject(command, actor, payloadHash, commandId, now)
        : deleteRelation(command, actor, payloadHash, commandId, now);
  }

  private CommandResult deleteObject(
      SoftDeleteCommand command, Actor actor, String payloadHash, String commandId, Instant now) {
    var object =
        repository
            .lockObject(command.workspaceId(), command.targetId())
            .orElseThrow(CommandErrors::targetNotFound);
    checkPermission(command, actor, object.createdBy());
    if ("DELETED".equals(object.status())) {
      return commit(command, payloadHash, commandId, List.of(), now);
    }
    if (!"DRAFT".equals(object.status())) {
      permissionChecker.check(
          "admin.softdelete", command.workspaceId(), command.targetId(), Set.of(), actor);
    }
    if (object.version() != command.expectedVersion()) {
      throw CommandErrors.version(
          object.id().toString(), command.expectedVersion(), object.version(), List.of());
    }
    var eventIds =
        archiveHandler.handleRelations(
            command.workspaceId(),
            command.targetId(),
            command.relationPolicy(),
            command.reason(),
            actor,
            now,
            command.correlationId(),
            commandId);
    var version = repository.updateObjectStatus(object.id(), "DELETED", actor.id(), now);
    var event =
        EventFactory.softDeleted(
            command.workspaceId(),
            "object",
            object.id(),
            object.status(),
            command.reason(),
            version,
            actor,
            now,
            command.correlationId(),
            commandId);
    repository.insertEvent(event);
    eventIds.add(event.eventId());
    return commit(command, payloadHash, commandId, eventIds, now);
  }

  private CommandResult deleteRelation(
      SoftDeleteCommand command, Actor actor, String payloadHash, String commandId, Instant now) {
    var relation =
        relations
            .lockRelation(command.workspaceId(), command.targetId())
            .orElseThrow(CommandErrors::targetNotFound);
    checkPermission(command, actor, relation.createdBy());
    if ("DELETED".equals(relation.status())) {
      return commit(command, payloadHash, commandId, List.of(), now);
    }
    if (!"DRAFT".equals(relation.status())) {
      permissionChecker.check(
          "admin.softdelete", command.workspaceId(), command.targetId(), Set.of(), actor);
    }
    if (relation.version() != command.expectedVersion()) {
      throw CommandErrors.relationVersion(
          relation.id().toString(), command.expectedVersion(), relation.version());
    }
    relations.clearClosureIfHierarchical(command.workspaceId(), relation);
    var version = relations.updateStatus(relation, "DELETED", actor.id(), now);
    var event =
        EventFactory.softDeleted(
            command.workspaceId(),
            "relation",
            relation.id(),
            relation.status(),
            command.reason(),
            version,
            actor,
            now,
            command.correlationId(),
            commandId);
    repository.insertEvent(event);
    return commit(command, payloadHash, commandId, List.of(event.eventId()), now);
  }

  private void checkPermission(SoftDeleteCommand command, Actor actor, String createdBy) {
    if (!actor.id().equals(createdBy)) {
      permissionChecker.check(
          "admin.softdelete", command.workspaceId(), command.targetId(), Set.of(), actor);
    }
  }

  private CommandResult commit(
      SoftDeleteCommand command,
      String payloadHash,
      String commandId,
      List<String> events,
      Instant now) {
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "SoftDelete",
        payloadHash,
        events,
        now);
  }

  private void validate(SoftDeleteCommand command) {
    if (!Set.of("object", "relation").contains(command.targetType())
        || command.targetId() == null) {
      throw CommandErrors.schema("targetType 与 targetId 必填");
    }
    if (command.reason() == null
        || command.reason().isBlank()
        || command.reason().length() > 2000) {
      throw CommandErrors.schema("reason 长度必须为 1..2000");
    }
    if (!Set.of("reject", "unlink").contains(policy(command.relationPolicy()))) {
      throw CommandErrors.schema("relationPolicy 仅允许 reject 或 unlink");
    }
    if (command.expectedVersion() < 1) throw CommandErrors.schema("expectedVersion 必须至少为 1");
  }

  private String policy(String value) {
    return value == null ? "reject" : value;
  }

  private Map<String, Object> payload(SoftDeleteCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("targetType", command.targetType());
    payload.put("targetId", command.targetId().toString());
    payload.put("reason", command.reason());
    payload.put("expectedVersion", command.expectedVersion());
    payload.put("relationPolicy", policy(command.relationPolicy()));
    return payload;
  }
}
