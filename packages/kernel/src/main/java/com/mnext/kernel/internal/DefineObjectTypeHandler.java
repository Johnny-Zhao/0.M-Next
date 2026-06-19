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
    if (replay.isPresent()) {
      var objectTypeId =
          meta.objectTypeByCode(command.workspaceId(), command.code())
              .orElseThrow(CommandErrors::typeNotFound)
              .id();
      return withDetail(replay.get(), "objectTypeId=" + objectTypeId);
    }
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    var existing = meta.objectTypeByCode(command.workspaceId(), command.code()).orElse(null);
    var parent = parent(command);
    var objectTypeId = existing == null ? java.util.UUID.randomUUID() : existing.id();
    if (existing == null) {
      meta.insertObjectType(
          objectTypeId,
          command.workspaceId(),
          command.templateVersionId(),
          command.code(),
          command.name(),
          parent == null ? null : parent.id(),
          actor.id(),
          now);
    } else {
      meta.updateObjectType(
          existing.id(), command.name(), parent == null ? null : parent.id(), actor.id(), now);
    }
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "DefineObjectType",
        hash,
        List.of("objectTypeId=" + objectTypeId),
        now);
  }

  private CommandResult withDetail(CommandResult replay, String detail) {
    return new CommandResult(
        replay.commandId(), replay.status(), replay.idempotentReplay(), List.of(detail), null);
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
    var existing = meta.objectTypeByCode(command.workspaceId(), command.code()).orElse(null);
    var parent = parent(command);
    if (existing != null && existing.published()) throw CommandErrors.metaPublishedImmutable();
    if (existing != null && existing.templateVersionId() != null) {
      var status = meta.templateVersionStatus(existing.templateVersionId());
      if (status.filter("published"::equals).isPresent())
        throw CommandErrors.templateVersionImmutable();
    }
    if (parent != null) {
      if (!sameTemplate(templateVersion(command, existing), parent.templateVersionId())) {
        throw CommandErrors.metaParentCrossTemplate();
      }
      if (existing != null
          && meta.objectTypeDescendsFrom(command.workspaceId(), parent.id(), existing.id())) {
        throw CommandErrors.metaGeneralizationCycle();
      }
    }
  }

  private MetaModelRepository.ObjectTypeRow parent(DefineObjectTypeCommand command) {
    if (command.parentTypeCode() == null) return null;
    return meta.objectTypeByCode(command.workspaceId(), command.parentTypeCode())
        .orElseThrow(CommandErrors::metaParentNotFound);
  }

  private boolean sameTemplate(java.util.UUID left, java.util.UUID right) {
    return left == null ? right == null : left.equals(right);
  }

  private java.util.UUID templateVersion(
      DefineObjectTypeCommand command, MetaModelRepository.ObjectTypeRow existing) {
    return existing == null ? command.templateVersionId() : existing.templateVersionId();
  }

  private LinkedHashMap<String, Object> payload(DefineObjectTypeCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    if (command.templateVersionId() != null) {
      payload.put("templateVersionId", command.templateVersionId().toString());
    }
    payload.put("code", command.code());
    payload.put("name", command.name());
    payload.put("parentTypeCode", command.parentTypeCode());
    return payload;
  }

  private boolean validCode(String code) {
    return code != null && code.matches("[a-z][a-z0-9_]{0,127}");
  }
}
