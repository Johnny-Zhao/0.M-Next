package com.mnext.engines.review;

import static org.junit.jupiter.api.Assertions.assertFalse;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ReviewArchitectureTest {
  private static final Path REVIEW = Path.of("src/main/java/com/mnext/engines/review");

  @Test
  void reviewDoesNotImportKernelInternal() throws IOException {
    assertFalse(source().contains("com.mnext.kernel.internal"));
  }

  @Test
  void reviewHandlersDoNotWriteMasterDataTables() throws IOException {
    var source = source().toLowerCase();
    for (var table : new String[] {"data_object", "data_field_value", "data_relation"}) {
      assertFalse(source.contains("insert into " + table));
      assertFalse(source.contains("update " + table));
      assertFalse(source.contains("delete from " + table));
    }
  }

  private static String source() throws IOException {
    var text = new StringBuilder();
    try (var files = Files.walk(REVIEW)) {
      for (var file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
        text.append(Files.readString(file));
      }
    }
    return text.toString();
  }
}
