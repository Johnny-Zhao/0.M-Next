package com.mnext.kernel.internal;

import java.lang.reflect.Array;
import java.util.Collection;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

final class JsonCodec {
  private JsonCodec() {}

  static String encode(Object value) {
    if (value == null) {
      return "null";
    }
    if (value instanceof String text) {
      return quote(text);
    }
    if (value instanceof Number || value instanceof Boolean) {
      return value.toString();
    }
    if (value instanceof Map<?, ?> map) {
      return encodeMap(map);
    }
    if (value instanceof Collection<?> collection) {
      return collection.stream().map(JsonCodec::encode).collect(Collectors.joining(",", "[", "]"));
    }
    if (value.getClass().isArray()) {
      return encodeArray(value);
    }
    return quote(value.toString());
  }

  static Object decodeScalar(String value) {
    if (value == null || "null".equals(value)) return null;
    if ("true".equals(value) || "false".equals(value)) return Boolean.valueOf(value);
    if (value.startsWith("\"") && value.endsWith("\"")) {
      return value.substring(1, value.length() - 1).replace("\\\"", "\"").replace("\\\\", "\\");
    }
    try {
      return value.contains(".") ? Double.valueOf(value) : Long.valueOf(value);
    } catch (NumberFormatException ignored) {
      return value;
    }
  }

  private static String encodeMap(Map<?, ?> source) {
    var sorted = new TreeMap<String, Object>();
    source.forEach((key, value) -> sorted.put(key.toString(), value));
    return sorted.entrySet().stream()
        .map(entry -> quote(entry.getKey()) + ":" + encode(entry.getValue()))
        .collect(Collectors.joining(",", "{", "}"));
  }

  private static String encodeArray(Object value) {
    var items = new StringBuilder("[");
    for (int index = 0; index < Array.getLength(value); index++) {
      if (index > 0) {
        items.append(',');
      }
      items.append(encode(Array.get(value, index)));
    }
    return items.append(']').toString();
  }

  private static String quote(String value) {
    var escaped =
        value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\b", "\\b")
            .replace("\f", "\\f")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
    return '"' + escaped + '"';
  }
}
