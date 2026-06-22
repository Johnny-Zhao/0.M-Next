package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.WithdrawTemplateVersionCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class WithdrawTemplateVersionHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  WithdrawTemplateVersionHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(WithdrawTemplateVersionCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.publish", command.workspaceId(), command.templateVersionId(), Set.of(), actor);
    if (command.templateVersionId() == null) throw CommandErrors.schema("templateVersionId 必填");
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    var status =
        meta.templateVersionStatus(command.templateVersionId())
            .orElseThrow(CommandErrors::typeNotFound);
    if (!"published".equals(status)) {
      throw CommandErrors.stateTransition(status, List.of("published"));
    }
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    meta.updateTemplateVersionStatus(command.templateVersionId(), "withdrawn");
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "WithdrawTemplateVersion",
        hash,
        List.of(command.templateVersionId().toString()),
        now);
  }

  private LinkedHashMap<String, Object> payload(WithdrawTemplateVersionCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", command.templateVersionId().toString());
    return payload;
  }
}
