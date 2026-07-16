package com.mnext.server;

import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OutputController {
  private final OutputSnapshotRepository outputs;
  private final WorkspaceAuthorizer authorizer;

  public OutputController(OutputSnapshotRepository outputs, WorkspaceAuthorizer authorizer) {
    this.outputs = outputs;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/outputs")
  public OutputMeta create(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody(required = false) OutputCreateRequest request) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    return outputs.create(workspaceId, request, actorId);
  }

  @GetMapping("/workspaces/{workspaceId}/outputs")
  public PageView<OutputMeta> list(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Actor-Id", required = false) String actorId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    if (page < 0 || size < 1 || size > 50) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..50");
    }
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    return outputs.list(workspaceId, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/outputs/{outputId}")
  public OutputDetail get(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Actor-Id", required = false) String actorId,
      @PathVariable("outputId") UUID outputId) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    return outputs.get(workspaceId, outputId);
  }
}
