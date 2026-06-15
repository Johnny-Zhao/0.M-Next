package com.mnext.engines.sim;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public record SimResult(Map<String, Object> values) {
  public SimResult {
    values = sorted(values == null ? Map.of() : values);
  }

  private static Map<String, Object> sorted(Map<String, Object> value) {
    var result = new TreeMap<String, Object>();
    value.forEach((key, item) -> result.put(key, sortedValue(item)));
    return Collections.unmodifiableMap(result);
  }

  private static Object sortedValue(Object value) {
    if (value instanceof Map<?, ?> nested) {
      var result = new TreeMap<String, Object>();
      nested.forEach((key, item) -> result.put(String.valueOf(key), sortedValue(item)));
      return Collections.unmodifiableMap(result);
    }
    if (value instanceof List<?> values) {
      return values.stream().map(SimResult::sortedValue).toList();
    }
    return value;
  }
}
