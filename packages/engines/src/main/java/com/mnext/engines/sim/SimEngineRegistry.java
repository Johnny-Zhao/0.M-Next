package com.mnext.engines.sim;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.ServiceLoader;

public final class SimEngineRegistry {
  private final Map<String, SimulationEngine> engines;

  public SimEngineRegistry() {
    this(ServiceLoader.load(SimulationEngine.class));
  }

  SimEngineRegistry(Iterable<SimulationEngine> loaded) {
    var values = new LinkedHashMap<String, SimulationEngine>();
    for (var engine : loaded) {
      var previous = values.putIfAbsent(engine.engineId(), engine);
      if (previous != null) {
        throw new IllegalArgumentException("duplicate simulation engine: " + engine.engineId());
      }
    }
    this.engines = Map.copyOf(values);
  }

  public SimulationEngine require(String engineId) {
    var engine = engines.get(engineId);
    if (engine == null) {
      throw new IllegalArgumentException("SIM-422-ENGINE-NOT-FOUND: 未注册仿真引擎 " + engineId);
    }
    return engine;
  }
}
