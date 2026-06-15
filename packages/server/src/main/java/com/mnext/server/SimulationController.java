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
public class SimulationController {
  private final SimulationRunRepository runs;
  private final SimulationRunner runner;

  public SimulationController(SimulationRunRepository runs, SimulationRunner runner) {
    this.runs = runs;
    this.runner = runner;
  }

  @PostMapping("/workspaces/{workspaceId}/simulations")
  public SimulationRunView create(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody(required = false) SimulationCreateRequest request) {
    var run = runs.create(workspaceId, request, actorId);
    runner.enqueue(run.runId());
    return run;
  }

  @GetMapping("/workspaces/{workspaceId}/simulations")
  public PageView<SimulationRunView> list(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "50") int size) {
    if (page < 0 || size < 1 || size > 50) {
      throw new IllegalArgumentException("page 必须非负且 size 必须为 1..50");
    }
    return runs.list(workspaceId, page, size);
  }

  @GetMapping("/workspaces/{workspaceId}/simulations/{runId}")
  public SimulationRunView get(
      @PathVariable("workspaceId") UUID workspaceId, @PathVariable("runId") UUID runId) {
    return runs.get(workspaceId, runId);
  }
}
