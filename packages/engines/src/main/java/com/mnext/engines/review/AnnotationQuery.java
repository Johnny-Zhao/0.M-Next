package com.mnext.engines.review;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class AnnotationQuery {
  private final AnnotationRepository repository;

  public AnnotationQuery(AnnotationRepository repository) {
    this.repository = repository;
  }

  public List<AnnotationView> find(
      UUID workspaceId, String targetType, UUID targetId, String fieldCode) {
    return repository.findByTarget(workspaceId, targetType, targetId, fieldCode);
  }
}
