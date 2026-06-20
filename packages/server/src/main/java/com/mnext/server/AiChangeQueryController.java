package com.mnext.server;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AiChangeQueryController {
  private static final Set<String> STATUSES = Set.of("PROPOSED", "REJECTED", "CONFIRMED");
  private final AiChangeRepository repository;
  private final WorkspaceAuthorizer authorizer;

  public AiChangeQueryController(AiChangeRepository repository, WorkspaceAuthorizer authorizer) {
    this.repository = repository;
    this.authorizer = authorizer;
  }

  @GetMapping("/workspaces/{workspaceId}/views/ai-changes")
  public List<AiChangeSetView> find(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Actor-Id", required = false) String actorId,
      @RequestParam(value = "status", required = false) String status,
      @RequestParam(value = "setId", required = false) UUID setId) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    if (status != null && !status.isBlank() && !STATUSES.contains(status)) {
      throw new IllegalArgumentException("status 仅支持 PROPOSED、REJECTED、CONFIRMED");
    }
    return repository.find(workspaceId, status, setId);
  }
}
