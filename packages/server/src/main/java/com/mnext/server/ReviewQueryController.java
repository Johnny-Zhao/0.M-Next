package com.mnext.server;

import com.mnext.engines.review.AnnotationQuery;
import com.mnext.engines.review.AnnotationView;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReviewQueryController {
  private final AnnotationQuery query;

  public ReviewQueryController(AnnotationQuery query) {
    this.query = query;
  }

  @GetMapping("/workspaces/{workspaceId}/annotations")
  public List<AnnotationView> find(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("targetType") String targetType,
      @RequestParam("targetId") UUID targetId,
      @RequestParam(value = "fieldCode", required = false) String fieldCode) {
    return query.find(workspaceId, targetType, targetId, fieldCode);
  }
}
