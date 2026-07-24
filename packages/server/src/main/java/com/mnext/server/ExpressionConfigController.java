package com.mnext.server;

import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ExpressionConfigController {
  private final ExpressionConfigService service;
  private final WorkspaceAuthorizer authorizer;

  ExpressionConfigController(ExpressionConfigService service, WorkspaceAuthorizer authorizer) {
    this.service = service;
    this.authorizer = authorizer;
  }

  @GetMapping("/workspaces/{workspaceId}/expression-configs")
  List<ExpressionConfig> list(
      @PathVariable("workspaceId") UUID workspaceId, @RequestHeader("X-Actor-Id") String actorId) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    return service.list(workspaceId);
  }

  @PostMapping("/workspaces/{workspaceId}/expression-configs")
  ExpressionConfig create(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody ExpressionConfigCreateRequest request) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    return service.create(workspaceId, actorId, request);
  }
}
