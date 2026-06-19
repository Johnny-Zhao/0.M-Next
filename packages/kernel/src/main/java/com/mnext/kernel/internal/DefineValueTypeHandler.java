package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class DefineValueTypeHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  DefineValueTypeHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(DefineValueTypeCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.define", command.workspaceId(), command.templateVersionId(), Set.of(), actor);
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) {
      var valueTypeId =
          meta.valueTypeByCode(command.workspaceId(), command.code())
              .orElseThrow(CommandErrors::typeNotFound)
              .id();
      return withDetail(replay.get(), "valueTypeId=" + valueTypeId);
    }
    var existing = meta.valueTypeByCode(command.workspaceId(), command.code()).orElse(null);
    var parent = parent(command);
    validate(command, existing, parent);
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    var valueTypeId = existing == null ? UUID.randomUUID() : existing.id();
    if (existing == null) {
      meta.insertValueType(
          valueTypeId,
          command.workspaceId(),
          command.templateVersionId(),
          command.code(),
          command.name(),
          command.basePrimitive(),
          parent == null ? null : parent.id(),
          constraints(command),
          actor.id(),
          now);
    } else {
      meta.updateValueType(
          existing.id(),
          command.name(),
          parent == null ? null : parent.id(),
          constraints(command),
          now);
    }
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "DefineValueType",
        hash,
        List.of("valueTypeId=" + valueTypeId),
        now);
  }

  private CommandResult withDetail(CommandResult replay, String detail) {
    return new CommandResult(
        replay.commandId(), replay.status(), replay.idempotentReplay(), List.of(detail), null);
  }

  private MetaModelRepository.ValueTypeRow parent(DefineValueTypeCommand command) {
    if (command.parentValueTypeCode() == null) return null;
    return meta.valueTypeByCode(command.workspaceId(), command.parentValueTypeCode())
        .orElseThrow(CommandErrors::metaParentNotFound);
  }

  private void validate(
      DefineValueTypeCommand command,
      MetaModelRepository.ValueTypeRow existing,
      MetaModelRepository.ValueTypeRow parent) {
    if (!validCode(command.code())
        || command.name() == null
        || command.name().isBlank()
        || command.name().length() > 256
        || command.basePrimitive() == null) {
      throw CommandErrors.schema("code、name 与 basePrimitive 不符合约束");
    }
    if (command.templateVersionId() != null) {
      var status = meta.templateVersionStatus(command.templateVersionId());
      if (status.isEmpty()) throw CommandErrors.typeNotFound();
      if ("published".equals(status.get())) throw CommandErrors.templateVersionImmutable();
    }
    if (existing != null && existing.published()) throw CommandErrors.metaPublishedImmutable();
    if (existing != null && existing.templateVersionId() != null) {
      var status = meta.templateVersionStatus(existing.templateVersionId());
      if (status.filter("published"::equals).isPresent())
        throw CommandErrors.templateVersionImmutable();
    }
    if (existing != null && existing.basePrimitive() != command.basePrimitive()) {
      throw CommandErrors.metaValueTypeBaseMismatch();
    }
    if (parent != null && parent.basePrimitive() != command.basePrimitive()) {
      throw CommandErrors.metaValueTypeBaseMismatch();
    }
    if (existing != null
        && parent != null
        && meta.valueTypeDescendsFrom(parent.id(), existing.id())) {
      throw CommandErrors.metaGeneralizationCycle();
    }
    if (parent != null) {
      var parentEffective = meta.resolveEffectiveValueType(parent.id());
      var violations =
          meta.narrowingViolations(
              command.workspaceId(), parentEffective.constraints(), constraints(command));
      if (!violations.isEmpty()) throw CommandErrors.metaRedefinitionInconsistent(violations);
    }
  }

  private FieldConstraints constraints(DefineValueTypeCommand command) {
    return command.constraints() == null ? FieldConstraints.empty() : command.constraints();
  }

  private LinkedHashMap<String, Object> payload(DefineValueTypeCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    if (command.templateVersionId() != null) {
      payload.put("templateVersionId", command.templateVersionId().toString());
    }
    payload.put("code", command.code());
    payload.put("name", command.name());
    payload.put(
        "basePrimitive", command.basePrimitive() == null ? null : command.basePrimitive().code());
    payload.put("parentValueTypeCode", command.parentValueTypeCode());
    payload.put("constraints", constraints(command).asMap());
    return payload;
  }

  private boolean validCode(String code) {
    return code != null && code.matches("[a-z][a-z0-9_]{0,127}");
  }
}
