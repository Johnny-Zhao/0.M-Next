package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.commands.ChangeStateCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class ChangeStateHandler {
  private static final List<String> CONTROLLED =
      List.of("DRAFT", "PENDING_CONFIRM", "CONFIRMED", "ISSUE", "TO_FIX", "FIXED", "FILED");
  private final KernelRepository repository;
  private final RelationRepository relations;
  private final PermissionChecker permissionChecker;
  private final CommandSupport support;

  ChangeStateHandler(
      KernelRepository repository,
      RelationRepository relations,
      PermissionChecker permissionChecker) {
    this.repository = repository;
    this.relations = relations;
    this.permissionChecker = permissionChecker;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  public CommandResult execute(ChangeStateCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissionChecker.check(
        "state.change",
        command.workspaceId(),
        command.targetId(),
        Set.of(command.toState()),
        actor);
    validate(command);
    var payloadHash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), payloadHash);
    if (replay.isPresent()) return replay.get();
    if ("fieldValue".equals(command.targetType())) {
      // TODO 阶段3规则联动时实现字段值状态
      throw CommandErrors.schema("本批次不支持 fieldValue 状态");
    }
    var target = lock(command);
    var allowed = allowed(target.status());
    if (!target.status().equals(command.fromState()) || !allowed.contains(command.toState())) {
      throw CommandErrors.stateTransition(target.status(), allowed);
    }
    if (target.version() != command.expectedVersion()) {
      throw versionError(command, target);
    }
    // TODO 阶段3规则联动时接入进入 CONFIRMED 的规则前置检查
    return apply(command, actor, target, payloadHash);
  }

  private StateTarget lock(ChangeStateCommand command) {
    if ("object".equals(command.targetType())) {
      var object =
          repository
              .lockObject(command.workspaceId(), command.targetId())
              .orElseThrow(CommandErrors::targetNotFound);
      return new StateTarget(object.status(), object.version());
    }
    var relation =
        relations
            .lockRelation(command.workspaceId(), command.targetId())
            .orElseThrow(CommandErrors::targetNotFound);
    return new StateTarget(relation.status(), relation.version());
  }

  private CommandResult apply(
      ChangeStateCommand command, Actor actor, StateTarget target, String payloadHash) {
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    var version =
        "object".equals(command.targetType())
            ? repository.updateObjectStatus(command.targetId(), command.toState(), actor.id(), now)
            : relations.updateStatus(
                relations.lockRelation(command.workspaceId(), command.targetId()).orElseThrow(),
                command.toState(),
                actor.id(),
                now);
    var event =
        EventFactory.stateChanged(
            command.workspaceId(),
            command.targetType(),
            command.targetId(),
            target.status(),
            command.toState(),
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
        "ChangeState",
        payloadHash,
        List.of(event.eventId()),
        now);
  }

  private RuntimeException versionError(ChangeStateCommand command, StateTarget target) {
    return "object".equals(command.targetType())
        ? CommandErrors.version(
            command.targetId().toString(), command.expectedVersion(), target.version(), List.of())
        : CommandErrors.relationVersion(
            command.targetId().toString(), command.expectedVersion(), target.version());
  }

  private List<String> allowed(String current) {
    var index = CONTROLLED.indexOf(current);
    if (index < 0) return List.of();
    if (index == CONTROLLED.size() - 1) return List.of("VOID");
    return List.of(CONTROLLED.get(index + 1), "VOID");
  }

  private void validate(ChangeStateCommand command) {
    if (!Set.of("object", "relation", "fieldValue").contains(command.targetType())
        || command.targetId() == null
        || command.fromState() == null
        || command.toState() == null) {
      throw CommandErrors.schema("targetType、targetId、fromState 与 toState 必填");
    }
    if (command.reason() == null
        || command.reason().isBlank()
        || command.reason().length() > 2000) {
      throw CommandErrors.schema("reason 长度必须为 1..2000");
    }
    if (command.expectedVersion() < 1) throw CommandErrors.schema("expectedVersion 必须至少为 1");
  }

  private Map<String, Object> payload(ChangeStateCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("targetType", command.targetType());
    payload.put("targetId", command.targetId().toString());
    payload.put("fromState", command.fromState());
    payload.put("toState", command.toState());
    payload.put("reason", command.reason());
    payload.put("expectedVersion", command.expectedVersion());
    return payload;
  }

  private record StateTarget(String status, long version) {}
}
