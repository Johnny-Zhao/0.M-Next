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
public class SnapshotController {
  private final SnapshotRepository snapshots;
  private final WorkspaceAuthorizer authorizer;

  public SnapshotController(SnapshotRepository snapshots, WorkspaceAuthorizer authorizer) {
    this.snapshots = snapshots;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/snapshots")
  public SnapshotMeta capture(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody(required = false) SnapshotCaptureRequest request) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    var scope = request == null ? null : blankToNull(request.scopeObjectType());
    return snapshots.capture(
        workspaceId, scope, request == null ? null : request.treeScope(), actorId);
  }

  @GetMapping("/workspaces/{workspaceId}/snapshots")
  public PageView<SnapshotMeta> list(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Actor-Id", required = false) String actorId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    if (page < 0 || size < 1 || size > 50) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..50");
    }
    return snapshots.list(workspaceId, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/snapshots/{snapshotId}")
  public SnapshotDetail get(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader(value = "X-Actor-Id", required = false) String actorId,
      @PathVariable("snapshotId") UUID snapshotId) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.READ);
    return snapshots.get(workspaceId, snapshotId);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
