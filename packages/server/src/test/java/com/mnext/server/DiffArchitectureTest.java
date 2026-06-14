package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class DiffArchitectureTest {
  private static final Path ROOT = Path.of("src/main/java/com/mnext/server");

  @Test
  void diffEndpointDoesNotWriteOrIssueCommands() throws Exception {
    var source = Files.readString(ROOT.resolve("DiffController.java")).toLowerCase();
    assertFalse(source.contains("kernelcommandservice"));
    assertFalse(source.contains("insert into"));
    assertFalse(source.contains("update "));
    assertFalse(source.contains("delete from"));
  }

  @Test
  void currentDataSetReadsOnlyWorkspaceScopedReadModelTables() throws Exception {
    var source = Files.readString(ROOT.resolve("ReadModelRepository.java")).toLowerCase();
    var method =
        source.substring(source.indexOf("dataset dataset("), source.indexOf("private objectview"));
    assertTrue(method.contains("where workspace_id = ?"));
    assertTrue(method.contains("from rm_object"));
    assertTrue(method.contains("from rm_relation"));
    assertFalse(method.contains("data_object"));
    assertFalse(method.contains("data_field_value"));
    assertFalse(method.contains("data_relation"));
    assertFalse(method.contains("insert into"));
    assertFalse(method.contains("update "));
    assertFalse(method.contains("delete from"));
  }
}
