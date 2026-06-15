package com.mnext.server;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.sim.SimConfig;
import com.mnext.engines.sim.SimResult;
import com.mnext.engines.sim.SimulationEngine;

public final class FailingSimulationEngine implements SimulationEngine {
  @Override
  public String engineId() {
    return "fail-test";
  }

  @Override
  public SimResult run(DataSet snapshot, SimConfig config) {
    throw new IllegalStateException("planned failure");
  }
}
