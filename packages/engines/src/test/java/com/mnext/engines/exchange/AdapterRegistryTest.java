package com.mnext.engines.exchange;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.mnext.engines.exchange.DataSet.DataObject;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AdapterRegistryTest {
  @Test
  void serviceLoaderFindsBuiltInAndTestAdapters() {
    var registry = new AdapterRegistry();

    assertEquals("application/json", registry.require("json").mediaType());
    assertEquals("application/xml", registry.require("reqif").mediaType());
    assertEquals(
        "workspace:type:1",
        registry.require("echo").exportFromDataSet("workspace", "type", dataSet()));
  }

  @Test
  void unknownFormatReportsSchemaError() {
    var failure =
        assertThrows(
            IllegalArgumentException.class, () -> new AdapterRegistry().require("missing"));

    assertEquals(true, failure.getMessage().contains("KERNEL-400-SCHEMA-INVALID"));
  }

  private static DataSet dataSet() {
    return new DataSet(
        List.of(new DataObject("one", "demo", Map.of("name", "One"), "DRAFT", 1)), List.of());
  }
}
