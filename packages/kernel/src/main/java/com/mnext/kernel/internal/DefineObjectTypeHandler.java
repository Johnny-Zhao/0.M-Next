package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class DefineObjectTypeHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  DefineObjectTypeHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(DefineObjectTypeCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.define", command.workspaceId(), command.templateVersionId(), Set.of(), actor);
    validate(command);
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    meta.insertObjectType(
        java.util.UUID.randomUUID(),
        command.workspaceId(),
        command.templateVersionId(),
        command.code(),
        command.name(),
        actor.id(),
        now);
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "DefineObjectType",
        hash,
        List.of(),
        now);
  }

  private void validate(DefineObjectTypeCommand command) {
    if (!validCode(command.code())
        || command.name() == null
        || command.name().isBlank()
        || command.name().length() > 256) {
      throw CommandErrors.schema("code 或 name 不符合约束");
    }
    if (command.templateVersionId() != null) {
      var status = meta.templateVersionStatus(command.templateVersionId());
      if (status.isEmpty()) throw CommandErrors.typeNotFound();
      if ("published".equals(status.get())) throw CommandErrors.templateVersionImmutable();
    }
    if (meta.objectTypeCodeExists(command.workspaceId(), command.code())) {
      throw CommandErrors.schema("对象类型 code 已存在");
    }
  }

  private LinkedHashMap<String, Object> payload(DefineObjectTypeCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    if (command.templateVersionId() != null) {
      payload.put("templateVersionId", command.templateVersionId().toString());
    }
    payload.put("code", command.code());
    payload.put("name", command.name());
    return payload;
  }

  private boolean validCode(String code) {
    return code != null && code.matches("[a-z][a-z0-9_]{0,127}");
  }
}
