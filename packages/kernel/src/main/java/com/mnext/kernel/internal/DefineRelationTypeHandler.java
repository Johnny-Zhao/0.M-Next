package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
    permissions.check("metamodel.define", command.workspaceId(), null, Set.of(), actor);
    validate(command);
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    meta.insertRelationType(
        java.util.UUID.randomUUID(),
        command.workspaceId(),
        null,
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
        List.of(),
        now);
  }

  private void validate(DefineRelationTypeCommand command) {
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
    if (meta.relationTypeCodeExists(command.workspaceId(), command.code())) {
      throw CommandErrors.schema("关系类型 code 已存在");
    }
    var violations = new ArrayList<String>();
    if (command.hierarchical() && !"one_to_many".equals(command.cardinality())) {
      violations.add("hierarchical 关系必须使用 one_to_many");
    }
    if (!violations.isEmpty()) throw CommandErrors.fieldConstraint(violations);
  }

  private LinkedHashMap<String, Object> payload(DefineRelationTypeCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("code", command.code());
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
}
