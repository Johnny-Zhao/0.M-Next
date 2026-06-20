package com.mnext.server;

import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MembersQueryController {
  private final RbacRepository rbac;
  private final WorkspaceAuthorizer authorizer;

  public MembersQueryController(RbacRepository rbac, WorkspaceAuthorizer authorizer) {
    this.rbac = rbac;
    this.authorizer = authorizer;
  }

  @GetMapping("/workspaces/{workspaceId}/members")
  public List<MemberView> members(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Actor-Id", required = false) String actorId) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    return rbac.members(workspaceId);
  }
}
