package com.mnext.server;

import com.mnext.engines.sim.SimConfig;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Component;

@Component
class SimulationRunner {
  private final SimulationRunRepository runs;
  private final TaskExecutor taskExecutor;
  private final boolean asyncEnabled;

  SimulationRunner(
      SimulationRunRepository runs,
      @Qualifier("applicationTaskExecutor") TaskExecutor taskExecutor,
      @Value("${mnext.sim.async.enabled:true}") boolean asyncEnabled) {
    this.runs = runs;
    this.taskExecutor = taskExecutor;
    this.asyncEnabled = asyncEnabled;
  }

  void enqueue(java.util.UUID runId) {
    if (asyncEnabled) {
      taskExecutor.execute(() -> runOne(runId));
    }
  }

  int drain() {
    var queued = runs.queuedRunIds();
    queued.forEach(this::runOne);
    return queued.size();
  }

  void runOne(java.util.UUID runId) {
    var workspaceId = runs.workspaceId(runId);
    var run = runs.get(workspaceId, runId);
    runs.start(runId);
    try {
      var snapshot = runs.snapshot(workspaceId, run.snapshotId());
      var engine = runs.engines().require(run.engineId());
      var result = engine.run(snapshot.payload(), new SimConfig(run.config()));
      runs.complete(runId, result);
    } catch (Exception failure) {
      runs.fail(runId, "SIM-500-ENGINE-FAILED");
    }
  }
}
