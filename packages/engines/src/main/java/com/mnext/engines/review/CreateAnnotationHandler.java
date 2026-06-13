package com.mnext.engines.review;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.KernelQueryPort;
import com.mnext.kernel.api.PermissionChecker;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CreateAnnotationHandler {
  private final PermissionChecker permissions;
  private final KernelQueryPort kernel;
  private final AnnotationRepository annotations;

  public CreateAnnotationHandler(
      PermissionChecker permissions, KernelQueryPort kernel, AnnotationRepository annotations) {
    this.permissions = permissions;
    this.kernel = kernel;
    this.annotations = annotations;
  }

  @Transactional
  public AnnotationView execute(CreateAnnotationCommand command, Actor actor) {
    permissions.check(
        "review.annotation.create",
        command.workspaceId(),
        command.targetId(),
        command.fieldCode() == null ? Set.of() : Set.of(command.fieldCode()),
        actor);
    validateAnchor(command);
    var id = UUID.randomUUID();
    annotations.insert(command, id, actor.id(), Instant.now());
    return annotations.find(command.workspaceId(), id).orElseThrow();
  }

  private void validateAnchor(CreateAnnotationCommand command) {
    switch (command.targetType()) {
      case "field" -> validateField(command);
      case "object" -> {
        rejectFieldCode(command);
        if (!kernel.objectExists(command.workspaceId(), command.targetId())) {
          throw ReviewErrors.targetNotFound();
        }
      }
      case "relation" -> {
        rejectFieldCode(command);
        if (!kernel.relationExists(command.workspaceId(), command.targetId())) {
          throw ReviewErrors.targetNotFound();
        }
      }
      default -> throw ReviewErrors.schema("targetType 仅允许 object、field、relation");
    }
  }

  private void validateField(CreateAnnotationCommand command) {
    if (command.fieldCode() == null || command.fieldCode().isBlank()) {
      throw ReviewErrors.fieldCodeRequired();
    }
    if (!kernel.objectExists(command.workspaceId(), command.targetId())
        || !kernel.fieldDefExistsForObject(
            command.workspaceId(), command.targetId(), command.fieldCode())) {
      throw ReviewErrors.targetNotFound();
    }
  }

  private void rejectFieldCode(CreateAnnotationCommand command) {
    if (command.fieldCode() != null) {
      throw ReviewErrors.schema("object/relation 级批注不得提供 fieldCode");
    }
  }
}
