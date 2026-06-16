package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.ApplyTemplateVersionCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class ApplyTemplateVersionHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  ApplyTemplateVersionHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(ApplyTemplateVersionCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.apply", command.workspaceId(), command.workspaceId(), Set.of(), actor);
    validate(command);
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    var workspace = meta.workspaceTemplate(command.workspaceId());
    if (workspace == null
        || workspace.templateId() == null
        || workspace.templateVersion() == null) {
      throw CommandErrors.templateNotPublished();
    }
    var toVersion = meta.templateVersion(workspace.templateId(), command.toVersion());
    if (toVersion == null || !"published".equals(toVersion.status())) {
      throw CommandErrors.templateNotPublished();
    }
    var fromVersion = meta.templateVersion(workspace.templateId(), workspace.templateVersion());
    if (fromVersion == null) throw CommandErrors.templateNotPublished();
    var plan =
        meta.planTemplateVersionApply(command.workspaceId(), fromVersion.id(), toVersion.id());
    if (!plan.blockingChanges().isEmpty()) {
      throw CommandErrors.migrationRequired(plan.blockingChanges());
    }
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    meta.applyTemplateVersion(
        command.workspaceId(), toVersion.id(), command.toVersion(), actor.id(), now, plan);
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "ApplyTemplateVersion",
        hash,
        List.of(),
        now);
  }

  private void validate(ApplyTemplateVersionCommand command) {
    if (command.toVersion() < 1) throw CommandErrors.schema("toVersion 必须大于 0");
  }

  private LinkedHashMap<String, Object> payload(ApplyTemplateVersionCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("toVersion", command.toVersion());
    return payload;
  }
}
