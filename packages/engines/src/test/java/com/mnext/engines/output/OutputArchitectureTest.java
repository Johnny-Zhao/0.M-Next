package com.mnext.engines.output;

import static org.junit.jupiter.api.Assertions.assertFalse;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class OutputArchitectureTest {
  private static final Path OUTPUT = Path.of("src/main/java/com/mnext/engines/output");

  @Test
  void outputRenderersArePure() throws Exception {
    var source = new StringBuilder();
    try (var files = Files.walk(OUTPUT)) {
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
}
