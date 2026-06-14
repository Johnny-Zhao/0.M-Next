package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ExchangeArchitectureTest {
  private static final Path ROOT = Path.of("src/main/java/com/mnext/server");

  @Test
  void exchangeControllerWritesOnlyThroughKernelCommandService() throws Exception {
    var source = Files.readString(ROOT.resolve("ExchangeController.java")).toLowerCase();
    assertTrue(source.contains("kernelcommandservice"));
    assertFalse(source.contains("jdbctemplate"));
    assertFalse(source.contains("insert into"));
    assertFalse(source.contains("update "));
    assertFalse(source.contains("delete from"));
    assertFalse(source.contains("com.mnext.kernel.internal"));
  }
}
