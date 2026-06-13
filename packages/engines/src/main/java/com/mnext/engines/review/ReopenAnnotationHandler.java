package com.mnext.engines.review;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.PermissionChecker;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReopenAnnotationHandler {
  private final PermissionChecker permissions;
  private final AnnotationRepository annotations;

  public ReopenAnnotationHandler(PermissionChecker permissions, AnnotationRepository annotations) {
    this.permissions = permissions;
    this.annotations = annotations;
  }

  @Transactional
  public AnnotationView execute(ReopenAnnotationCommand command, Actor actor) {
    permissions.check(
        "review.annotation.reopen", command.workspaceId(), command.annotationId(), Set.of(), actor);
    var annotation =
        annotations
            .find(command.workspaceId(), command.annotationId())
            .orElseThrow(ReviewErrors::targetNotFound);
    if (!Set.of("resolved", "wontfix").contains(annotation.status())) {
      throw ReviewErrors.invalidState();
    }
    annotations.reopen(command.workspaceId(), command.annotationId());
    return annotations.find(command.workspaceId(), command.annotationId()).orElseThrow();
  }
}
