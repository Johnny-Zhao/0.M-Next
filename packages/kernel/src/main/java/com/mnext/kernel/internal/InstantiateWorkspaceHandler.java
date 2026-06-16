package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class InstantiateWorkspaceHandler {
  private static final int TYPE_LIMIT = 500;
  private final MetaModelRepository meta;
  private final KernelRepository repository;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  InstantiateWorkspaceHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.repository = repository;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(InstantiateWorkspaceCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.instantiate", command.workspaceId(), command.templateId(), Set.of(), actor);
    validatePayload(command);
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    var version = meta.templateVersion(command.templateId(), command.version());
    if (version == null || !"published".equals(version.status())) {
      throw CommandErrors.templateNotPublished();
    }
    var typeCount = meta.templateTypeCount(version.id());
    if (typeCount > TYPE_LIMIT) throw CommandErrors.batchTooLarge(1, typeCount);
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    repository.insertWorkspace(
        command.newWorkspaceId(),
        command.workspaceName(),
        command.templateId(),
        command.version(),
        now);
    meta.instantiateTemplateVersion(
        version.id(), command.workspaceId(), command.newWorkspaceId(), actor.id(), now);
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "InstantiateWorkspace",
        hash,
        List.of(command.newWorkspaceId().toString()),
        now);
  }

  private void validatePayload(InstantiateWorkspaceCommand command) {
    if (command.templateId() == null
        || command.version() < 1
        || command.newWorkspaceId() == null
        || command.workspaceName() == null
        || command.workspaceName().isBlank()
        || command.workspaceName().length() > 256) {
      throw CommandErrors.schema("templateId、version、newWorkspaceId、workspaceName 不符合约束");
    }
  }

  private LinkedHashMap<String, Object> payload(InstantiateWorkspaceCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateId", command.templateId().toString());
    payload.put("version", command.version());
    payload.put("newWorkspaceId", command.newWorkspaceId().toString());
    payload.put("workspaceName", command.workspaceName());
    return payload;
  }
}
