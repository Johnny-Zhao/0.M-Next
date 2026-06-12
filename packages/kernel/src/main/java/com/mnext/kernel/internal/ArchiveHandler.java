package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.ArchiveCommand;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class ArchiveHandler {
  private final KernelRepository repository;
  private final RelationRepository relations;
  private final UnlinkHandler unlinkHandler;
  private final PermissionChecker permissionChecker;
  private final CommandSupport support;

  ArchiveHandler(
      KernelRepository repository,
      RelationRepository relations,
      UnlinkHandler unlinkHandler,
      PermissionChecker permissionChecker) {
    this.repository = repository;
    this.relations = relations;
    this.unlinkHandler = unlinkHandler;
    this.permissionChecker = permissionChecker;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  public CommandResult execute(ArchiveCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissionChecker.check(
        "archive.execute", command.workspaceId(), command.targetId(), Set.of(), actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), payloadHash);
    if (replay.isPresent()) return replay.get();
    if ("artifact".equals(command.targetType())) {
      // TODO 阶段7 实现制品废止
      throw CommandErrors.schema("本批次不支持 artifact 废止");
    }
    // TODO 阶段7 快照引用检查
    var commandId = CommandSupport.commandId();
    var now = Instant.now();
    return "object".equals(command.targetType())
        ? archiveObject(command, actor, payloadHash, commandId, now)
        : archiveRelation(command, actor, payloadHash, commandId, now);
  }

  private CommandResult archiveObject(
      ArchiveCommand command, Actor actor, String payloadHash, String commandId, Instant now) {
    var object =
        repository
            .lockObject(command.workspaceId(), command.targetId())
            .orElseThrow(CommandErrors::targetNotFound);
    if ("VOID".equals(object.status())) {
      return commit(command, payloadHash, commandId, List.of(), now);
    }
    if (object.version() != command.expectedVersion()) {
      throw CommandErrors.version(
          object.id().toString(), command.expectedVersion(), object.version(), List.of());
    }
    var active = relations.lockActiveForObject(command.workspaceId(), command.targetId(), 51);
    var total = relations.activeForObjectCount(command.workspaceId(), command.targetId());
    validateRelations(command.relationPolicy(), active, total);
    var eventIds = unlinkAll(command, actor, commandId, now, active);
    var version = repository.updateObjectStatus(object.id(), "VOID", actor.id(), now);
    var archived =
        EventFactory.archived(
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
    repository.insertEvent(archived);
    eventIds.add(archived.eventId());
    return commit(command, payloadHash, commandId, eventIds, now);
  }

  private CommandResult archiveRelation(
      ArchiveCommand command, Actor actor, String payloadHash, String commandId, Instant now) {
    var relation =
        relations
            .lockRelation(command.workspaceId(), command.targetId())
            .orElseThrow(CommandErrors::targetNotFound);
    if ("VOID".equals(relation.status())) {
      return commit(command, payloadHash, commandId, List.of(), now);
    }
    if (relation.version() != command.expectedVersion()) {
      throw CommandErrors.relationVersion(
          relation.id().toString(), command.expectedVersion(), relation.version());
    }
    var version = relations.updateStatus(relation, "VOID", actor.id(), now);
    var event =
        EventFactory.archived(
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

  private ArrayList<String> unlinkAll(
      ArchiveCommand command,
      Actor actor,
      String commandId,
      Instant now,
      List<RelationRow> active) {
    var eventIds = new ArrayList<String>();
    if (!"unlink".equals(policy(command.relationPolicy()))) return eventIds;
    for (var relation : active) {
      eventIds.add(
          unlinkHandler
              .unlinkForCascade(
                  command.workspaceId(),
                  relation,
                  command.reason(),
                  actor,
                  now,
                  command.correlationId(),
                  commandId)
              .eventId());
    }
    return eventIds;
  }

  private void validateRelations(String relationPolicy, List<RelationRow> active, long total) {
    if (active.isEmpty()) return;
    if (!"unlink".equals(policy(relationPolicy))) {
      throw CommandErrors.activeRelations(
          active.stream().limit(50).map(row -> row.id().toString()).toList(), total);
    }
    if (total > 50) throw CommandErrors.cascadeTooLarge(total);
  }

  private CommandResult commit(
      ArchiveCommand command,
      String payloadHash,
      String commandId,
      List<String> events,
      Instant now) {
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "Archive",
        payloadHash,
        events,
        now);
  }

  private void validate(ArchiveCommand command) {
    if (!Set.of("object", "relation", "artifact").contains(command.targetType())
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

  private Map<String, Object> payload(ArchiveCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("targetType", command.targetType());
    payload.put("targetId", command.targetId().toString());
    payload.put("reason", command.reason());
    payload.put("expectedVersion", command.expectedVersion());
    payload.put("relationPolicy", policy(command.relationPolicy()));
    return payload;
  }
}
