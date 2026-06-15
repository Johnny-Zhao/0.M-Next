package com.mnext.engines.sim;

import com.mnext.engines.exchange.DataSet;

public interface SimulationEngine {
  String engineId();

  SimResult run(DataSet snapshot, SimConfig config);
}
