package com.mnext.server;

import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AiExtractionController {
  private final AiExtractionService service;
  private final WorkspaceAuthorizer authorizer;

  public AiExtractionController(AiExtractionService service, WorkspaceAuthorizer authorizer) {
    this.service = service;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/ai/extract")
  public AiExtractResponse extract(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody AiExtractRequest request) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    return new AiExtractResponse(service.extract(workspaceId, actorId, request.draft()));
  }
}

record AiExtractRequest(String draft) {}

record AiExtractResponse(UUID setId) {}
