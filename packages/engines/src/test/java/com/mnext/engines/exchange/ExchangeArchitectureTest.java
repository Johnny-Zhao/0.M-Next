package com.mnext.engines.exchange;

import static org.junit.jupiter.api.Assertions.assertFalse;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ExchangeArchitectureTest {
  private static final Path EXCHANGE = Path.of("src/main/java/com/mnext/engines/exchange");

  @Test
  void exchangeIsPureAndDoesNotImportKernelInternal() throws IOException {
    var source = new StringBuilder();
    try (var files = Files.walk(EXCHANGE)) {
      for (var file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
        source.append(Files.readString(file));
      }
    }
    var text = source.toString().toLowerCase();
    assertFalse(text.contains("com.mnext.kernel.internal"));
    assertFalse(text.contains("org.springframework"));
    assertFalse(text.contains("java.sql"));
    assertFalse(text.contains("insert into"));
    assertFalse(text.contains("update "));
    assertFalse(text.contains("delete from"));
  }

  @Test
  void sysmlAdapterStaysPure() throws IOException {
    var text = source(Path.of("src/main/java/com/mnext/engines/exchange/sysml")).toLowerCase();
    assertFalse(text.contains("org.springframework"));
    assertFalse(text.contains("java.sql"));
    assertFalse(text.contains("kernelcommandservice"));
    assertFalse(text.contains("insert into"));
    assertFalse(text.contains("update "));
    assertFalse(text.contains("delete from"));
  }

  private static String source(Path root) throws IOException {
    var source = new StringBuilder();
    try (var files = Files.walk(root)) {
      for (var file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
        source.append(Files.readString(file));
      }
    }
    return source.toString();
  }
}
