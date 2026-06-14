package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"mnext.outbox.enabled=false", "mnext.readmodel.enabled=false"})
class MatrixQueryIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID OTHER = UUID.fromString("99999999-9999-4999-8999-999999999999");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
  }

  @Test
  void returnsPagedRowsColumnsAndMatchingCells() {
    var row = object(WORKSPACE, "requirement", "Requirement");
    var col = object(WORKSPACE, "function", "Function");
    var outside = object(WORKSPACE, "function", "Outside");
    relation(WORKSPACE, row, col, "traces_to");
    relation(WORKSPACE, row, outside, "other_type");

    var matrix = get(WORKSPACE, "rowSize=1&colSize=2");

    assertEquals(1, list(matrix, "rows").size());
    assertEquals(2, list(matrix, "cols").size());
    assertEquals(1, list(matrix, "cells").size());
    assertEquals(row.toString(), list(matrix, "cells").getFirst().get("rowId"));
    assertEquals(col.toString(), list(matrix, "cells").getFirst().get("colId"));
    assertEquals(1, ((Number) matrix.get("rowTotal")).intValue());
    assertEquals(2, ((Number) matrix.get("colTotal")).intValue());
  }

  @Test
  void clampsSizesToFifty() {
    for (var index = 0; index < 51; index++) {
      object(WORKSPACE, "requirement", "Row " + index);
      object(WORKSPACE, "function", "Column " + index);
    }

    var matrix = get(WORKSPACE, "rowSize=99&colSize=99");

    assertEquals(50, list(matrix, "rows").size());
    assertEquals(50, list(matrix, "cols").size());
    assertEquals(51, ((Number) matrix.get("rowTotal")).intValue());
  }

  @Test
  void returnsEmptyCellsAndIsolatesWorkspace() {
    object(WORKSPACE, "requirement", "Visible row");
    object(WORKSPACE, "function", "Visible column");
    var otherRow = object(OTHER, "requirement", "Other row");
    var otherCol = object(OTHER, "function", "Other column");
    relation(OTHER, otherRow, otherCol, "traces_to");

    var matrix = get(WORKSPACE, "rowSize=50&colSize=50");

    assertTrue(list(matrix, "cells").isEmpty());
    assertEquals(1, list(matrix, "rows").size());
    assertEquals(1, list(matrix, "cols").size());
  }

  @Test
  void matrixQueryIsReadOnlyAndUsesOnlyReadModelTables() throws Exception {
    var source =
        Files.readString(Path.of("src/main/java/com/mnext/server/ReadModelRepository.java"))
            .toLowerCase();
    var method =
        source.substring(
            source.indexOf("matrixview matrix("),
            source.indexOf("boolean hierarchicalrelationtype"));

    assertTrue(method.contains("from rm_object"));
    assertTrue(method.contains("from rm_relation"));
    assertTrue(method.contains("workspace_id = ?"));
    assertFalse(method.contains("data_object"));
    assertFalse(method.contains("data_field_value"));
    assertFalse(method.contains("data_relation"));
    assertFalse(method.contains("insert into"));
    assertFalse(method.contains("update "));
    assertFalse(method.contains("delete from"));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(UUID workspace, String paging) {
    var response =
        http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + workspace
                + "/views/matrix?rowType=requirement&colType=function"
                + "&relationType=traces_to&"
                + paging,
            Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private java.util.List<Map<String, Object>> list(Map<String, Object> view, String key) {
    return (java.util.List<Map<String, Object>>) view.get(key);
  }

  private UUID object(UUID workspace, String type, String label) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, ?, 'DRAFT', 1, CAST(? AS jsonb), now())
        """,
        workspace,
        id,
        type,
        "{\"name\":\"" + label + "\"}");
    return id;
  }

  private void relation(UUID workspace, UUID row, UUID col, String type) {
    jdbc.update(
        """
        INSERT INTO rm_relation
          (workspace_id, relation_id, relation_type_code, source_id, target_id, fields,
           hierarchical, status, version, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}'::jsonb, false, 'ACTIVE', 1, now())
        """,
        workspace,
        UUID.randomUUID(),
        type,
        row,
        col);
  }
}
