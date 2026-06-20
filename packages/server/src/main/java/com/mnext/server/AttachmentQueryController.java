package com.mnext.server;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AttachmentQueryController {
  private final AttachmentRepository attachments;

  public AttachmentQueryController(AttachmentRepository attachments) {
    this.attachments = attachments;
  }

  @GetMapping("/workspaces/{workspaceId}/views/attachments")
  public List<AttachmentView> attachments(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam("objectId") UUID objectId,
      @RequestParam(value = "status", defaultValue = "ACTIVE") String status) {
    if (!Set.of("ACTIVE", "DELETED").contains(status)) {
      throw new IllegalArgumentException("status 必须为 ACTIVE 或 DELETED");
    }
    return attachments.attachments(workspaceId, objectId, status);
  }
}
