package com.mnext.engines.sim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.engines.exchange.DataSet;
import com.mnext.engines.exchange.DataSet.DataObject;
import com.mnext.engines.exchange.DataSet.DataRelation;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SimEngineTest {
  private static final Path SIM = Path.of("src/main/java/com/mnext/engines/sim");

  @Test
  void echoEngineIsDeterministicForSameSnapshotAndConfig() throws Exception {
    var engine = new EchoSimulationEngine();
    var config = new SimConfig(Map.of("step", 1, "mode", "smoke"));

    var first = engine.run(dataSet(), config);
    var second = engine.run(dataSet(), new SimConfig(Map.of("mode", "smoke", "step", 1)));

    assertEquals(first, second);
    assertEquals(stableHash(first), stableHash(second));
    assertEquals(2, first.values().get("objectCount"));
    assertEquals(1, first.values().get("relationCount"));
  }

  @Test
  void registryFindsBuiltInAndTestEngines() {
    var registry = new SimEngineRegistry();

    assertEquals("echo", registry.require("echo").engineId());
    assertEquals("test-static", registry.require("test-static").engineId());
  }

  @Test
  void unknownEngineReportsSimulationError() {
    var failure =
        assertThrows(
            IllegalArgumentException.class, () -> new SimEngineRegistry().require("missing"));

    assertTrue(failure.getMessage().contains("SIM-422-ENGINE-NOT-FOUND"));
  }

  @Test
  void simulationEnginesArePure() throws Exception {
    var source = new StringBuilder();
    try (var files = Files.walk(SIM)) {
      for (var file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
        source.append(Files.readString(file));
      }
    }
    var text = source.toString().toLowerCase();
    assertFalse(text.contains("org.springframework"));
    assertFalse(text.contains("java.sql"));
    assertFalse(text.contains("kernelcommandservice"));
    assertFalse(text.contains("insert into"));
    assertFalse(text.contains("update "));
    assertFalse(text.contains("delete from"));
  }

  private static DataSet dataSet() {
    return new DataSet(
        List.of(
            new DataObject("one", "requirement", Map.of("name", "One"), "DRAFT", 1),
            new DataObject("two", "function", Map.of("name", "Two"), "DRAFT", 1)),
        List.of(new DataRelation("rel", "trace", "one", "two", Map.of("weight", 1))));
  }

  private static String stableHash(SimResult result) throws Exception {
    var bytes = result.values().toString().getBytes(StandardCharsets.UTF_8);
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }
}
