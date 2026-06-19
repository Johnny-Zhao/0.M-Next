package com.mnext.engines.sim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EnergySocSimulationEngineTest {
  private static final double DELTA = 0.000_000_001d;

  @Test
  void calculatesEnergySocCurveForOneOrbit() {
    var result =
        engine()
            .run(
                dataSet(
                    orbit(60, 30),
                    battery(100, 0.9d, null),
                    mode("nominal", 45),
                    mode("eclipse", 60)),
                config(10, 1.0d, 80));

    assertEquals("energy-soc", result.values().get("engineId"));
    assertEquals(100.0d, (double) result.values().get("capacityWh"), DELTA);
    assertEquals(10.0d, (double) result.values().get("stepMinutes"), DELTA);
    assertCurve(
        result,
        new double[] {10, 20, 30, 40, 50, 60, 70, 80, 90},
        new double[] {
          0.8888888889d, 0.7777777778d, 0.6666666667d, 0.8d, 0.9333333333d, 1.0d, 1.0d, 1.0d, 1.0d
        });
    assertEquals(0.6666666667d, (double) result.values().get("minSocRatio"), DELTA);
    assertEquals(0.3333333333d, (double) result.values().get("maxDodRatio"), DELTA);
    assertEquals(1.0d, (double) result.values().get("endSocRatio"), DELTA);
  }

  @Test
  void registryFindsEnergySocEngine() {
    assertEquals("energy-soc", new SimEngineRegistry().require("energy-soc").engineId());
  }

  @Test
  void missingRequiredObjectReportsSimulationError() {
    var failure =
        assertThrows(
            IllegalArgumentException.class,
            () -> engine().run(dataSet(orbit(60, 30), mode("eclipse", 60)), config(10, 1, 80)));

    assertTrue(failure.getMessage().contains("SIM-422-"));
    assertTrue(failure.getMessage().contains("battery_pack"));
  }

  @Test
  void tooManyStepsReportsSimulationError() {
    var failure =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                engine()
                    .run(
                        dataSet(orbit(2501, 2500), battery(100, 1, null), mode("eclipse", 1)),
                        config(1, 1, 1)));

    assertTrue(failure.getMessage().contains("SIM-422-"));
    assertTrue(failure.getMessage().contains("exceeds"));
  }

  @Test
  void clampsDischargeAndChargeToBatteryBounds() {
    var result =
        engine()
            .run(
                dataSet(orbit(120, 120), battery(100, 1, 1.0d), mode("eclipse", 120)),
                config(60, 0.5d, 200));

    assertCurve(result, new double[] {60, 120, 180, 240}, new double[] {0, 0, 1, 1});
    assertEquals(0.0d, (double) result.values().get("minSocRatio"), DELTA);
    assertEquals(1.0d, (double) result.values().get("maxDodRatio"), DELTA);
    assertEquals(1.0d, (double) result.values().get("endSocRatio"), DELTA);
  }

  private static EnergySocSimulationEngine engine() {
    return new EnergySocSimulationEngine();
  }

  private static SimConfig config(
      double timestepMinutes, double initialSocRatio, double rechargePowerW) {
    return new SimConfig(
        Map.of(
            "timestepMinutes", timestepMinutes,
            "initialSocRatio", initialSocRatio,
            "rechargePowerW", rechargePowerW));
  }

  private static DataSet dataSet(DataObject... objects) {
    return new DataSet(List.of(objects), List.of());
  }

  private static DataObject orbit(double sunlightMinutes, double eclipseMinutes) {
    return new DataObject(
        "orbit",
        "mission_orbit",
        Map.of("sunlight_min", sunlightMinutes, "eclipse_min", eclipseMinutes),
        "ACTIVE",
        1);
  }

  private static DataObject battery(
      double capacityWh, double dischargeEfficiency, Double chargeEfficiency) {
    var fields = new java.util.LinkedHashMap<String, Object>();
    fields.put("capacity_wh", capacityWh);
    fields.put("discharge_efficiency", dischargeEfficiency);
    if (chargeEfficiency != null) {
      fields.put("charge_efficiency", chargeEfficiency);
    }
    return new DataObject("battery", "battery_pack", fields, "ACTIVE", 1);
  }

  private static DataObject mode(String objectId, double eclipsePowerW) {
    return new DataObject(
        objectId, "operating_mode", Map.of("eclipse_power_w", eclipsePowerW), "ACTIVE", 1);
  }

  private static void assertCurve(SimResult result, double[] minutes, double[] socRatios) {
    var curve = (List<?>) result.values().get("socCurve");
    assertEquals(minutes.length, curve.size());
    for (var index = 0; index < minutes.length; index++) {
      var point = (Map<?, ?>) curve.get(index);
      assertEquals(minutes[index], ((Number) point.get("minute")).doubleValue(), DELTA);
      assertEquals(socRatios[index], ((Number) point.get("socRatio")).doubleValue(), DELTA);
    }
  }
}
