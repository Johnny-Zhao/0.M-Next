package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.PublishTemplateVersionCommand;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class PublishTemplateVersionHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  PublishTemplateVersionHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(PublishTemplateVersionCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.publish", command.workspaceId(), command.templateVersionId(), Set.of(), actor);
    if (command.templateVersionId() == null) throw CommandErrors.schema("templateVersionId 必填");
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    validate(command);
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    meta.publishTemplateVersion(command.templateVersionId(), actor.id(), now);
    meta.markTemplateTypesPublished(command.templateVersionId());
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "PublishTemplateVersion",
        hash,
        List.of(),
        now);
  }

  private void validate(PublishTemplateVersionCommand command) {
    var status =
        meta.templateVersionStatus(command.templateVersionId())
            .orElseThrow(CommandErrors::typeNotFound);
    if ("published".equals(status)) throw CommandErrors.templateVersionImmutable();
    if (meta.templateTypeCount(command.templateVersionId()) == 0) {
      throw CommandErrors.templateEmpty();
    }
  }

  private LinkedHashMap<String, Object> payload(PublishTemplateVersionCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", command.templateVersionId().toString());
    return payload;
  }
}
