package com.mnext.engines.sim;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class EnergySocSimulationEngine implements SimulationEngine {
  private static final int MAX_STEPS = 5000;
  private static final String ENGINE_ID = "energy-soc";
  private static final String MISSION_ORBIT = "mission_orbit";
  private static final String BATTERY_PACK = "battery_pack";
  private static final String OPERATING_MODE = "operating_mode";

  @Override
  public String engineId() {
    return ENGINE_ID;
  }

  @Override
  public SimResult run(DataSet snapshot, SimConfig config) {
    var orbit = requiredObject(snapshot, MISSION_ORBIT);
    var battery = requiredObject(snapshot, BATTERY_PACK);
    var sunlightMinutes = requiredPositiveField(orbit, "sunlight_min");
    var eclipseMinutes = requiredPositiveField(orbit, "eclipse_min");
    var capacityWh = requiredPositiveField(battery, "capacity_wh");
    var dischargeEfficiency = requiredPositiveField(battery, "discharge_efficiency");
    var chargeEfficiency = optionalPositiveField(battery, "charge_efficiency", 1.0d);
    var eclipsePowerW = maxOperatingModePower(snapshot);

    var parameters = config == null ? Map.<String, Object>of() : config.parameters();
    var stepMinutes = optionalPositiveParameter(parameters, "timestepMinutes", 1.0d);
    var initialSocRatio = optionalRatioParameter(parameters, "initialSocRatio", 1.0d);
    var rechargePowerW = requiredNonNegativeParameter(parameters, "rechargePowerW");
    assertBounded(eclipseMinutes, sunlightMinutes, stepMinutes);

    var socWh = capacityWh * initialSocRatio;
    var curve = new ArrayList<Map<String, Object>>();
    socWh =
        discharge(
            curve,
            socWh,
            capacityWh,
            eclipseMinutes,
            stepMinutes,
            eclipsePowerW,
            dischargeEfficiency);
    socWh =
        charge(
            curve,
            socWh,
            capacityWh,
            sunlightMinutes,
            stepMinutes,
            rechargePowerW,
            chargeEfficiency);

    var minSocRatio =
        curve.stream()
            .mapToDouble(point -> ((Number) point.get("socRatio")).doubleValue())
            .min()
            .orElse(initialSocRatio);

    return new SimResult(
        Map.of(
            "engineId",
            engineId(),
            "socCurve",
            List.copyOf(curve),
            "minSocRatio",
            minSocRatio,
            "maxDodRatio",
            1.0d - minSocRatio,
            "endSocRatio",
            socWh / capacityWh,
            "capacityWh",
            capacityWh,
            "stepMinutes",
            stepMinutes));
  }

  private static double discharge(
      List<Map<String, Object>> curve,
      double socWh,
      double capacityWh,
      double durationMinutes,
      double stepMinutes,
      double eclipsePowerW,
      double dischargeEfficiency) {
    var minute = 0.0d;
    var remaining = durationMinutes;
    while (remaining > 0.0d) {
      var dt = Math.min(stepMinutes, remaining);
      socWh = Math.max(0.0d, socWh - eclipsePowerW * (dt / 60.0d) / dischargeEfficiency);
      minute += dt;
      addPoint(curve, minute, socWh, capacityWh);
      remaining -= dt;
    }
    return socWh;
  }

  private static double charge(
      List<Map<String, Object>> curve,
      double socWh,
      double capacityWh,
      double durationMinutes,
      double stepMinutes,
      double rechargePowerW,
      double chargeEfficiency) {
    var minute = curve.isEmpty() ? 0.0d : ((Number) curve.getLast().get("minute")).doubleValue();
    var remaining = durationMinutes;
    while (remaining > 0.0d) {
      var dt = Math.min(stepMinutes, remaining);
      socWh = Math.min(capacityWh, socWh + rechargePowerW * (dt / 60.0d) * chargeEfficiency);
      minute += dt;
      addPoint(curve, minute, socWh, capacityWh);
      remaining -= dt;
    }
    return socWh;
  }

  private static void addPoint(
      List<Map<String, Object>> curve, double minute, double socWh, double capacityWh) {
    var point = new LinkedHashMap<String, Object>();
    point.put("minute", minute);
    point.put("socRatio", socWh / capacityWh);
    curve.add(Map.copyOf(point));
  }

  private static DataObject requiredObject(DataSet snapshot, String objectTypeCode) {
    if (snapshot == null) {
      throw simError("missing snapshot");
    }
    return snapshot.objects().stream()
        .filter(object -> objectTypeCode.equals(object.objectTypeCode()))
        .findFirst()
        .orElseThrow(() -> simError("missing object type " + objectTypeCode));
  }

  private static double maxOperatingModePower(DataSet snapshot) {
    return snapshot.objects().stream()
        .filter(object -> OPERATING_MODE.equals(object.objectTypeCode()))
        .mapToDouble(object -> requiredPositiveField(object, "eclipse_power_w"))
        .max()
        .orElseThrow(() -> simError("missing object type " + OPERATING_MODE));
  }

  private static double requiredPositiveField(DataObject object, String fieldCode) {
    if (!object.fields().containsKey(fieldCode)) {
      throw simError("missing field " + object.objectTypeCode() + "." + fieldCode);
    }
    return positive(
        number(object.fields().get(fieldCode), object.objectTypeCode() + "." + fieldCode),
        object.objectTypeCode() + "." + fieldCode);
  }

  private static double optionalPositiveField(
      DataObject object, String fieldCode, double defaultValue) {
    if (!object.fields().containsKey(fieldCode)) {
      return defaultValue;
    }
    return positive(
        number(object.fields().get(fieldCode), object.objectTypeCode() + "." + fieldCode),
        object.objectTypeCode() + "." + fieldCode);
  }

  private static double optionalPositiveParameter(
      Map<String, Object> parameters, String key, double defaultValue) {
    if (!parameters.containsKey(key)) {
      return defaultValue;
    }
    return positive(number(parameters.get(key), "config." + key), "config." + key);
  }

  private static double optionalRatioParameter(
      Map<String, Object> parameters, String key, double defaultValue) {
    if (!parameters.containsKey(key)) {
      return defaultValue;
    }
    var value = number(parameters.get(key), "config." + key);
    if (value < 0.0d || value > 1.0d) {
      throw simError("config." + key + " must be between 0 and 1");
    }
    return value;
  }

  private static double requiredNonNegativeParameter(Map<String, Object> parameters, String key) {
    if (!parameters.containsKey(key)) {
      throw simError("missing config." + key);
    }
    var value = number(parameters.get(key), "config." + key);
    if (value < 0.0d || !Double.isFinite(value)) {
      throw simError("config." + key + " must be non-negative");
    }
    return value;
  }

  private static double positive(double value, String label) {
    if (value <= 0.0d || !Double.isFinite(value)) {
      throw simError(label + " must be positive");
    }
    return value;
  }

  private static double number(Object value, String label) {
    if (value instanceof Number number) {
      return number.doubleValue();
    }
    if (value instanceof String text) {
      try {
        return Double.parseDouble(text);
      } catch (NumberFormatException ex) {
        throw simError(label + " must be numeric");
      }
    }
    throw simError(label + " must be numeric");
  }

  private static void assertBounded(
      double eclipseMinutes, double sunlightMinutes, double stepMinutes) {
    var steps = Math.ceil(eclipseMinutes / stepMinutes) + Math.ceil(sunlightMinutes / stepMinutes);
    if (steps > MAX_STEPS) {
      throw simError("energy-soc step count exceeds " + MAX_STEPS);
    }
  }

  private static IllegalArgumentException simError(String message) {
    return new IllegalArgumentException("SIM-422-" + message);
  }
}
