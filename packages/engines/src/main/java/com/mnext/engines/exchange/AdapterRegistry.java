package com.mnext.engines.exchange;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.ServiceLoader;

public final class AdapterRegistry {
  private final Map<String, ExchangeAdapter> adapters;

  public AdapterRegistry() {
    this(ServiceLoader.load(ExchangeAdapter.class));
  }

  AdapterRegistry(Iterable<ExchangeAdapter> loaded) {
    var values = new LinkedHashMap<String, ExchangeAdapter>();
    for (var adapter : loaded) {
      var previous = values.putIfAbsent(adapter.formatId(), adapter);
      if (previous != null) {
        throw new IllegalArgumentException("duplicate exchange format: " + adapter.formatId());
      }
    }
    this.adapters = Map.copyOf(values);
  }

  public ExchangeAdapter require(String formatId) {
    var adapter = adapters.get(formatId);
    if (adapter == null) {
      throw new IllegalArgumentException("KERNEL-400-SCHEMA-INVALID: 未知交换格式 " + formatId);
    }
    return adapter;
  }
}
