package com.mnext.engines.sim;

import com.mnext.engines.exchange.DataSet;
import java.util.Map;
import java.util.TreeMap;

public final class EchoSimulationEngine implements SimulationEngine {
  @Override
  public String engineId() {
    return "echo";
  }

  @Override
  public SimResult run(DataSet snapshot, SimConfig config) {
    var objectsByType = new TreeMap<String, Integer>();
    for (var object : snapshot.objects()) {
      objectsByType.merge(object.objectTypeCode(), 1, Integer::sum);
    }
    var relationsByType = new TreeMap<String, Integer>();
    for (var relation : snapshot.relations()) {
      relationsByType.merge(relation.relationTypeCode(), 1, Integer::sum);
    }
    return new SimResult(
        Map.of(
            "engineId", engineId(),
            "objectCount", snapshot.objects().size(),
            "relationCount", snapshot.relations().size(),
            "objectsByType", objectsByType,
            "relationsByType", relationsByType,
            "config", config.parameters()));
  }
}
