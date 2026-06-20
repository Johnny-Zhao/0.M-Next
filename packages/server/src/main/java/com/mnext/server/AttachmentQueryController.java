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
public class AttachmentQueryController {
  private final AttachmentRepository attachments;
  private final WorkspaceAuthorizer authorizer;

  public AttachmentQueryController(
      AttachmentRepository attachments, WorkspaceAuthorizer authorizer) {
    this.attachments = attachments;
    this.authorizer = authorizer;
  }

  @GetMapping("/workspaces/{workspaceId}/views/attachments")
  public List<AttachmentView> attachments(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Actor-Id", required = false) String actorId,
      @RequestParam("objectId") UUID objectId,
      @RequestParam(value = "status", defaultValue = "ACTIVE") String status) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    if (!Set.of("ACTIVE", "DELETED").contains(status)) {
      throw new IllegalArgumentException("status 必须为 ACTIVE 或 DELETED");
    }
    return attachments.attachments(workspaceId, objectId, status);
  }
}
