package com.mnext.engines.output;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.ServiceLoader;

public final class RenderRegistry {
  private final Map<String, RenderAdapter> adapters;

  public RenderRegistry() {
    this(ServiceLoader.load(RenderAdapter.class));
  }

  RenderRegistry(Iterable<RenderAdapter> loaded) {
    var values = new LinkedHashMap<String, RenderAdapter>();
    for (var adapter : loaded) {
      var previous = values.putIfAbsent(adapter.formatId(), adapter);
      if (previous != null) {
        throw new IllegalArgumentException("duplicate render format: " + adapter.formatId());
      }
    }
    this.adapters = Map.copyOf(values);
  }

  public RenderAdapter require(String formatId) {
    var adapter = adapters.get(formatId);
    if (adapter == null) {
      throw new IllegalArgumentException("KERNEL-400-SCHEMA-INVALID: 未知输出格式 " + formatId);
    }
    return adapter;
  }
}
