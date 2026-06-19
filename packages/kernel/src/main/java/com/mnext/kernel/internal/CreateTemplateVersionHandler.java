package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.CreateTemplateVersionCommand;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class CreateTemplateVersionHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  CreateTemplateVersionHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(CreateTemplateVersionCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.define", command.workspaceId(), command.templateId(), Set.of(), actor);
    if (command.templateId() == null) throw CommandErrors.schema("templateId 必填");
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    if (!meta.templateExists(command.templateId())) throw templateNotFound();
    var now = java.time.Instant.now();
    var commandId = CommandSupport.commandId();
    var templateVersionId = UUID.randomUUID();
    var version = meta.nextTemplateVersion(command.templateId());
    meta.insertTemplateVersion(templateVersionId, command.templateId(), version, "draft");
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "CreateTemplateVersion",
        hash,
        List.of("templateId=" + command.templateId(), "templateVersionId=" + templateVersionId),
        now);
  }

  private LinkedHashMap<String, Object> payload(CreateTemplateVersionCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateId", command.templateId().toString());
    return payload;
  }

  private CommandRejectedException templateNotFound() {
    return new CommandRejectedException(
        new CommandError(
            "KERNEL-404-TEMPLATE-NOT-FOUND", "模板或模板版本不存在", Map.of(), "确认 templateId 后重试"));
  }
}
