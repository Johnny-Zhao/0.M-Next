package com.mnext.engines.review;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.PermissionChecker;
import java.time.Instant;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ResolveAnnotationHandler {
  private final PermissionChecker permissions;
  private final AnnotationRepository annotations;

  public ResolveAnnotationHandler(PermissionChecker permissions, AnnotationRepository annotations) {
    this.permissions = permissions;
    this.annotations = annotations;
  }

  @Transactional
  public AnnotationView execute(ResolveAnnotationCommand command, Actor actor) {
    permissions.check(
        "review.annotation.resolve",
        command.workspaceId(),
        command.annotationId(),
        Set.of(),
        actor);
    var annotation =
        annotations
            .find(command.workspaceId(), command.annotationId())
            .orElseThrow(ReviewErrors::targetNotFound);
    if (!"open".equals(annotation.status())) throw ReviewErrors.invalidState();
    annotations.resolve(command.workspaceId(), command.annotationId(), actor.id(), Instant.now());
    return annotations.find(command.workspaceId(), command.annotationId()).orElseThrow();
  }
}
