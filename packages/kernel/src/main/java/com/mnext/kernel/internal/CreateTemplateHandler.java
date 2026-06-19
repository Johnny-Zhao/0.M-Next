package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.CreateTemplateCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class CreateTemplateHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  CreateTemplateHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(CreateTemplateCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check("metamodel.define", command.workspaceId(), null, Set.of(), actor);
    validate(command);
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    if (meta.templateCodeExists(command.code())) throw templateCodeConflict();
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    var templateId = UUID.randomUUID();
    var templateVersionId = UUID.randomUUID();
    meta.insertTemplate(templateId, command.code(), command.name(), actor.id(), now);
    meta.insertTemplateVersion(templateVersionId, templateId, 1, "draft");
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "CreateTemplate",
        hash,
        List.of(
            "templateId=" + templateId,
            "templateVersionId=" + templateVersionId,
            "code=" + command.code()),
        now);
  }

  private void validate(CreateTemplateCommand command) {
    if (!validCode(command.code())
        || command.name() == null
        || command.name().isBlank()
        || command.name().length() > 256) {
      throw CommandErrors.schema("code 或 name 不符合约束");
    }
  }

  private LinkedHashMap<String, Object> payload(CreateTemplateCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("code", command.code());
    payload.put("name", command.name());
    return payload;
  }

  private boolean validCode(String code) {
    return code != null && code.matches("[a-z][a-z0-9_]{0,127}");
  }

  private CommandRejectedException templateCodeConflict() {
    return new CommandRejectedException(
        new CommandError(
            "KERNEL-409-TEMPLATE-CODE-CONFLICT", "模板 code 已存在", Map.of(), "更换模板 code 后重试"));
  }
}
