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

  public OutputController(OutputSnapshotRepository outputs) {
    this.outputs = outputs;
  }

  @PostMapping("/workspaces/{workspaceId}/outputs")
  public OutputMeta create(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody(required = false) OutputCreateRequest request) {
    return outputs.create(workspaceId, request, actorId);
  }

  @GetMapping("/workspaces/{workspaceId}/outputs")
  public PageView<OutputMeta> list(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    if (page < 0 || size < 1 || size > 50) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..50");
    }
    return outputs.list(workspaceId, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/outputs/{outputId}")
  public OutputDetail get(
      @PathVariable("workspaceId") UUID workspaceId, @PathVariable("outputId") UUID outputId) {
    return outputs.get(workspaceId, outputId);
  }
}
