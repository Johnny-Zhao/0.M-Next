package com.mnext.server;

import com.mnext.engines.exchange.DataSet;
import java.lang.reflect.InvocationTargetException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.ServiceLoader;
import org.springframework.stereotype.Component;

@Component
class SimulationEngineBridge {
  private static final String SIM_PACKAGE = "com.mnext.engines." + "sim.";

  private final Class<?> configType;
  private final Map<String, Object> engines;

  SimulationEngineBridge() {
    try {
      var engineType = Class.forName(SIM_PACKAGE + "SimulationEngine");
      this.configType = Class.forName(SIM_PACKAGE + "SimConfig");
      var values = new LinkedHashMap<String, Object>();
      for (var engine : ServiceLoader.load(engineType)) {
        var engineId = (String) engineType.getMethod("engineId").invoke(engine);
        var previous = values.putIfAbsent(engineId, engine);
        if (previous != null)
          throw new IllegalArgumentException("duplicate simulation engine: " + engineId);
      }
      this.engines = Map.copyOf(values);
    } catch (ReflectiveOperationException failure) {
      throw new IllegalStateException("仿真 SPI 无法加载", failure);
    }
  }

  void require(String engineId) {
    if (!engines.containsKey(engineId)) {
      throw new SimulationException("SIM-422-ENGINE-NOT-FOUND", "未注册仿真引擎", "检查 engineId 或安装对应仿真插件");
    }
  }

  @SuppressWarnings("unchecked")
  Map<String, Object> run(String engineId, DataSet snapshot, Map<String, Object> config) {
    require(engineId);
    try {
      var engine = engines.get(engineId);
      var configValue = configType.getConstructor(Map.class).newInstance(config);
      var result =
          engine
              .getClass()
              .getMethod("run", DataSet.class, configType)
              .invoke(engine, snapshot, configValue);
      return (Map<String, Object>) result.getClass().getMethod("values").invoke(result);
    } catch (InvocationTargetException failure) {
      var cause = failure.getCause();
      if (cause instanceof RuntimeException runtime) throw runtime;
      throw new IllegalStateException(cause);
    } catch (ReflectiveOperationException failure) {
      throw new IllegalStateException("仿真 SPI 调用失败", failure);
    }
  }
}
