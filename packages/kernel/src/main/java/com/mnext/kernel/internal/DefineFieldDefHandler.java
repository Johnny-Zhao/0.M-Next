package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.PermissionChecker;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class DefineFieldDefHandler {
  private final MetaModelRepository meta;
  private final PermissionChecker permissions;
  private final CommandSupport support;

  DefineFieldDefHandler(
      MetaModelRepository meta, KernelRepository repository, PermissionChecker permissions) {
    this.meta = meta;
    this.permissions = permissions;
    this.support = new CommandSupport(repository);
  }

  @Transactional
  CommandResult execute(DefineFieldDefCommand command, Actor actor) {
    support.validateEnvelope(
        command.workspaceId(), command.correlationId(), command.idempotencyKey());
    permissions.check(
        "metamodel.define",
        command.workspaceId(),
        command.objectTypeId(),
        Set.of(command.code()),
        actor);
    validate(command);
    var hash = CommandSupport.payloadHash(payload(command));
    var replay = support.replay(command.workspaceId(), command.idempotencyKey(), hash);
    if (replay.isPresent()) return replay.get();
    var templateVersion =
        meta.objectTypeTemplateVersion(command.workspaceId(), command.objectTypeId());
    if (templateVersion == null) throw CommandErrors.typeNotFound();
    templateVersion.ifPresent(this::validateMutable);
    var now = Instant.now();
    var commandId = CommandSupport.commandId();
    meta.insertFieldDef(
        java.util.UUID.randomUUID(),
        command.objectTypeId(),
        templateVersion.orElse(null),
        command.code(),
        command.name(),
        command.dataType(),
        command.required(),
        constraints(command),
        actor.id(),
        now);
    return support.commit(
        command.workspaceId(),
        command.idempotencyKey(),
        commandId,
        "DefineFieldDef",
        hash,
        List.of(),
        now);
  }

  private void validate(DefineFieldDefCommand command) {
    if (command.objectTypeId() == null
        || command.dataType() == null
        || !validCode(command.code())
        || command.name() == null
        || command.name().isBlank()
        || command.name().length() > 256) {
      throw CommandErrors.schema("objectTypeId、code、name 与 dataType 不符合约束");
    }
    if (meta.fieldCodeExists(command.objectTypeId(), command.code())) {
      throw CommandErrors.schema("字段 code 已存在");
    }
    var violations = constraintViolations(command);
    if (!violations.isEmpty()) throw CommandErrors.fieldConstraint(violations);
  }

  private List<String> constraintViolations(DefineFieldDefCommand command) {
    var constraints = constraints(command);
    var violations = new ArrayList<String>();
    if (constraints.minLength() != null
        && constraints.maxLength() != null
        && constraints.minLength() > constraints.maxLength())
      violations.add("minLength 不得大于 maxLength");
    if (constraints.min() != null
        && constraints.max() != null
        && constraints.min().compareTo(constraints.max()) > 0) violations.add("min 不得大于 max");
    if (command.dataType() == DataType.ENUM
        && (constraints.enumValues() == null || constraints.enumValues().isEmpty())) {
      violations.add("enum 必须提供非空 enumValues");
    }
    if (command.dataType() == DataType.REF
        && (constraints.refObjectTypeCode() == null
            || !meta.objectTypeCodeExists(
                command.workspaceId(), constraints.refObjectTypeCode()))) {
      violations.add("refObjectTypeCode 必须指向存在的对象类型");
    }
    if (constraints.pattern() != null
        && (constraints.pattern().length() > 256 || unsafePattern(constraints.pattern()))) {
      violations.add("pattern 超长或可能产生灾难性回溯");
    }
    if ((constraints.min() != null || constraints.max() != null)
        && command.dataType() != DataType.NUMBER
        && command.dataType() != DataType.INTEGER) {
      violations.add("min/max 仅适用于 number 或 integer");
    }
    if ((constraints.minLength() != null
            || constraints.maxLength() != null
            || constraints.pattern() != null)
        && command.dataType() != DataType.STRING
        && command.dataType() != DataType.TEXT) {
      violations.add("长度与 pattern 约束仅适用于 string 或 text");
    }
    if (constraints.enumValues() != null && command.dataType() != DataType.ENUM) {
      violations.add("enumValues 仅适用于 enum");
    }
    if (constraints.refObjectTypeCode() != null && command.dataType() != DataType.REF) {
      violations.add("refObjectTypeCode 仅适用于 ref");
    }
    return violations;
  }

  private void validateMutable(java.util.UUID templateVersionId) {
    if (meta.templateVersionStatus(templateVersionId).filter("published"::equals).isPresent()) {
      throw CommandErrors.templateVersionImmutable();
    }
  }

  private FieldConstraints constraints(DefineFieldDefCommand command) {
    return command.constraints() == null ? FieldConstraints.empty() : command.constraints();
  }

  private LinkedHashMap<String, Object> payload(DefineFieldDefCommand command) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", command.objectTypeId().toString());
    payload.put("code", command.code());
    payload.put("name", command.name());
    payload.put("dataType", command.dataType().code());
    payload.put("required", command.required());
    payload.put("constraints", constraints(command).asMap());
    return payload;
  }

  private boolean unsafePattern(String pattern) {
    return pattern.matches(".*\\([^)]*[+*][^)]*\\)[+*].*")
        || pattern.contains(".*.*")
        || pattern.contains(".+.+");
  }

  private boolean validCode(String code) {
    return code != null && code.matches("[a-z][a-z0-9_]{0,127}");
  }
}
