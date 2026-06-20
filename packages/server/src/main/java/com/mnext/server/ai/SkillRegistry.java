package com.mnext.server.ai;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.ServiceLoader;
import org.springframework.stereotype.Component;

@Component
public class SkillRegistry {
  private static final int MAX_SKILLS = 50;
  private static final String SIMULATION_ENGINE = "com.mnext.engines." + "sim.SimulationEngine";

  public List<String> engineIds() {
    try {
      var type = Class.forName(SIMULATION_ENGINE);
      var ids = new LinkedHashSet<String>();
      for (var engine : ServiceLoader.load(type)) {
        if (ids.size() >= MAX_SKILLS) break;
        ids.add((String) type.getMethod("engineId").invoke(engine));
      }
      return List.copyOf(ids);
    } catch (ReflectiveOperationException failure) {
      return List.of();
    }
  }
}
