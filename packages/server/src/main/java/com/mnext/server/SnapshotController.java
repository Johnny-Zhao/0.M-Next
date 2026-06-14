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

  public SnapshotController(SnapshotRepository snapshots) {
    this.snapshots = snapshots;
  }

  @PostMapping("/workspaces/{workspaceId}/snapshots")
  public SnapshotMeta capture(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody(required = false) SnapshotCaptureRequest request) {
    var scope = request == null ? null : blankToNull(request.scopeObjectType());
    return snapshots.capture(workspaceId, scope, actorId);
  }

  @GetMapping("/workspaces/{workspaceId}/snapshots")
  public PageView<SnapshotMeta> list(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    if (page < 0 || size < 1 || size > 50) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..50");
    }
    return snapshots.list(workspaceId, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/snapshots/{snapshotId}")
  public SnapshotDetail get(
      @PathVariable("workspaceId") UUID workspaceId, @PathVariable("snapshotId") UUID snapshotId) {
    return snapshots.get(workspaceId, snapshotId);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
