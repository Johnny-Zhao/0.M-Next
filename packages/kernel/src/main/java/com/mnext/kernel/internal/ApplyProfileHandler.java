package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.ApplyProfileCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class ApplyProfileHandler {
  private static final int TYPE_LIMIT = 500;
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  ApplyProfileHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(ApplyProfileCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.applyProfile", command.workspaceId(), command.templateId(), Set.of(), actor);
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
    if (!meta.runtimeTemplateVersionApplied(command.workspaceId(), version.id())) {
      var sourceWorkspaceId = meta.templateVersionSourceWorkspace(version.id());
      meta.applyProfileTemplateVersion(
          version.id(), sourceWorkspaceId, command.workspaceId(), actor.id(), now);
    }
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "ApplyProfile",
        hash,
        List.of(),
        now);
  }

  private void validatePayload(ApplyProfileCommand command) {
    if (command.templateId() == null || command.version() < 1) {
      throw CommandErrors.schema("templateId、version 不符合约束");
    }
  }

  private LinkedHashMap<String, Object> payload(ApplyProfileCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateId", command.templateId().toString());
    payload.put("version", command.version());
    return payload;
  }
}
