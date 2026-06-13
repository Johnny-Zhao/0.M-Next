package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ReadModelArchitectureTest {
  @Test
  void projectionAndQueriesDoNotAccessMasterDataTables() throws Exception {
    for (var name :
        new String[] {
          "ReadModelProjection.java", "ReadModelRepository.java", "ViewQueryController.java"
        }) {
      var source = Files.readString(Path.of("src", "main", "java", "com", "mnext", "server", name));
      assertFalse(source.contains("data_object"));
      assertFalse(source.contains("data_field_value"));
      assertFalse(source.contains("data_relation"));
    }
  }

  @Test
  void rabbitClientIsOnlyUsedByListenerAndExistingOutboxAdapter() throws Exception {
    var root = Path.of("src", "main", "java", "com", "mnext", "server");
    try (var files = Files.list(root)) {
      var offenders =
          files
              .filter(path -> path.toString().endsWith(".java"))
              .filter(path -> read(path).contains("org.springframework.amqp"))
              .filter(path -> !path.getFileName().toString().equals("ReadModelRabbitListener.java"))
              .filter(path -> !path.getFileName().toString().equals("RabbitOutboxPublisher.java"))
              .toList();
      assertTrue(offenders.isEmpty(), offenders.toString());
    }
  }

  private static String read(Path path) {
    try {
      return Files.readString(path);
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }
}
