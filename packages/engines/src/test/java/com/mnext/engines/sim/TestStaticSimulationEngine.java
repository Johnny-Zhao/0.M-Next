package com.mnext.engines.sim;

import com.mnext.engines.exchange.DataSet;
import java.util.Map;

public final class TestStaticSimulationEngine implements SimulationEngine {
  @Override
  public String engineId() {
    return "test-static";
  }

  @Override
  public SimResult run(DataSet snapshot, SimConfig config) {
    return new SimResult(Map.of("test", true, "objects", snapshot.objects().size()));
  }
}
