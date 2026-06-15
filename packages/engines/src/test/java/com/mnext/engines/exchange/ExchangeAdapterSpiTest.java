package com.mnext.engines.exchange;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ExchangeAdapterSpiTest {
  private final AdapterRegistry registry = new AdapterRegistry();

  @Test
  void jsonAdapterRoundTripsDataSetIdentity() {
    var current = dataSet();
    var adapter = registry.require("json");

    var mapped =
        adapter.importToDataSet(adapter.exportFromDataSet("workspace", null, current), current);

    assertEquals(current, mapped);
  }

  @Test
  void reqIfAdapterRoundTripsDataSetIdentity() {
    var current = dataSet();
    var adapter = registry.require("reqif");

    var mapped =
        adapter.importToDataSet(adapter.exportFromDataSet("workspace", null, current), current);

    assertEquals(current, mapped);
  }

  private static DataSet dataSet() {
    return new DataSet(
        List.of(
            new DataObject("one", "demo", Map.of("name", "One", "cost", 1), "DRAFT", 2),
            new DataObject("two", "demo", Map.of("name", "Two"), "DRAFT", 1)),
        List.of(new DataRelation("depends|one|two", "depends", "one", "two", Map.of())));
  }
}
