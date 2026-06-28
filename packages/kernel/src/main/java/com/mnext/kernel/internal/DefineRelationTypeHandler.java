package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class DefineRelationTypeHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  DefineRelationTypeHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(DefineRelationTypeCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.define", command.workspaceId(), command.templateVersionId(), Set.of(), actor);
    validatePayload(command);
    var hash = CommandSupport.payloadHash(payload(command));
    var relationTypeId = relationTypeId(command, hash);
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return withDetail(replay.get(), "relationTypeId=" + relationTypeId);
    validateFresh(command);
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    meta.insertRelationType(
        relationTypeId,
        command.workspaceId(),
        command.templateVersionId(),
        command.code(),
        command.sourceTypeId(),
        command.targetTypeId(),
        command.direction(),
        command.cardinality(),
        command.semantics(),
        command.hierarchical(),
        actor.id(),
        now);
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "DefineRelationType",
        hash,
        List.of("relationTypeId=" + relationTypeId),
        now);
  }

  private CommandResult withDetail(CommandResult replay, String detail) {
    return new CommandResult(
        replay.commandId(), replay.status(), replay.idempotentReplay(), List.of(detail), null);
  }

  private java.util.UUID relationTypeId(DefineRelationTypeCommand command, String hash) {
    return java.util.UUID.nameUUIDFromBytes(
        ("DefineRelationType:"
                + command.workspaceId()
                + ":"
                + command.idempotencyKey()
                + ":"
                + hash)
            .getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }

  private void validatePayload(DefineRelationTypeCommand command) {
    if (!validCode(command.code())
        || command.sourceTypeId() == null
        || command.targetTypeId() == null
        || !Set.of("directed", "undirected").contains(command.direction())
        || !Set.of("one_to_one", "one_to_many", "many_to_many").contains(command.cardinality())
        || !Set.of("weak", "strong").contains(command.semantics())) {
      throw CommandErrors.schema("关系类型载荷不符合约束");
    }
    if (!meta.objectTypeExists(command.workspaceId(), command.sourceTypeId())
        || !meta.objectTypeExists(command.workspaceId(), command.targetTypeId())) {
      throw CommandErrors.typeNotFound();
    }
    validateTemplateVersion(command);
  }

  private void validateFresh(DefineRelationTypeCommand command) {
    if (relationTypeCodeExists(command)) {
      throw CommandErrors.schema("关系类型 code 已存在");
    }
    var violations = new ArrayList<String>();
    if (command.hierarchical() && !"one_to_many".equals(command.cardinality())) {
      violations.add("hierarchical 关系必须使用 one_to_many");
    }
    if (!violations.isEmpty()) throw CommandErrors.fieldConstraint(violations);
  }

  private boolean relationTypeCodeExists(DefineRelationTypeCommand command) {
    if (command.templateVersionId() == null) {
      return meta.relationTypeCodeExists(command.workspaceId(), command.code());
    }
    return meta.relationTypeCodeExists(
        command.workspaceId(), command.templateVersionId(), command.code());
  }

  private void validateTemplateVersion(DefineRelationTypeCommand command) {
    if (command.templateVersionId() == null) return;
    var status = meta.templateVersionStatus(command.templateVersionId());
    if (status.isEmpty()) throw templateNotFound();
    if ("published".equals(status.get())) throw CommandErrors.templateVersionImmutable();
    var sourceVersion =
        meta.objectTypeTemplateVersion(command.workspaceId(), command.sourceTypeId());
    var targetVersion =
        meta.objectTypeTemplateVersion(command.workspaceId(), command.targetTypeId());
    if (sourceVersion.isEmpty()
        || targetVersion.isEmpty()
        || !command.templateVersionId().equals(sourceVersion.get())
        || !command.templateVersionId().equals(targetVersion.get())) {
      throw CommandErrors.schema("关系类型端点必须属于同一模板版本");
    }
  }

  private LinkedHashMap<String, Object> payload(DefineRelationTypeCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    if (command.templateVersionId() != null) {
      payload.put("templateVersionId", command.templateVersionId().toString());
    }
    payload.put("code", command.code());
    payload.put("name", command.name());
    payload.put("sourceTypeId", command.sourceTypeId().toString());
    payload.put("targetTypeId", command.targetTypeId().toString());
    payload.put("direction", command.direction());
    payload.put("cardinality", command.cardinality());
    payload.put("semantics", command.semantics());
    payload.put("hierarchical", command.hierarchical());
    return payload;
  }

  private boolean validCode(String code) {
    return code != null && code.matches("[a-z][a-z0-9_]{0,127}");
  }

  private CommandRejectedException templateNotFound() {
    return new CommandRejectedException(
        new CommandError(
            "KERNEL-404-TEMPLATE-NOT-FOUND", "模板或模板版本不存在", Map.of(), "确认 templateVersionId 后重试"));
  }
}
