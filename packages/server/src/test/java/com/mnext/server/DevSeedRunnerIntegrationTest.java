package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@ActiveProfiles("dev")
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"mnext.outbox.enabled=false"})
class DevSeedRunnerIntegrationTest {
  private static final UUID INTERIOR_WORKSPACE =
      UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TECHNICAL_WORKSPACE =
      UUID.fromString("22222222-2222-4222-8222-222222222222");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired JdbcTemplate jdbc;
  @Autowired TestRestTemplate http;
  @Autowired DerivedEvaluator derivedEvaluator;
  @LocalServerPort int port;

  @Test
  void devSeedInstallsInteriorAndTechnicalProposalDemos() {
    assertEquals(1, objectCount(INTERIOR_WORKSPACE, "floorplan"));
    assertEquals(6, objectCount(INTERIOR_WORKSPACE, "room"));

    assertEquals(1, objectCount(TECHNICAL_WORKSPACE, "proposal"));
    assertEquals(2, objectCount(TECHNICAL_WORKSPACE, "system"));
    assertEquals(4, objectCount(TECHNICAL_WORKSPACE, "module"));
    assertEquals(2, objectCount(TECHNICAL_WORKSPACE, "interface"));
    assertEquals(2, objectCount(TECHNICAL_WORKSPACE, "requirement"));
    assertEquals(4, readModelCount(TECHNICAL_WORKSPACE, "module"));

    var orchestration = objectIdByField(TECHNICAL_WORKSPACE, "module", "name", "方案编排模块");
    assertDecimal(
        "1", derivedEvaluator.evaluate(TECHNICAL_WORKSPACE, orchestration, "child_count_fx"));

    assertEquals(1, checkResultCount(TECHNICAL_WORKSPACE, "R-TD-RESP"));
    assertEquals(1, checkResultCount(TECHNICAL_WORKSPACE, "R-TD-IF"));
    assertEquals(1, checkResultCount(TECHNICAL_WORKSPACE, "R-TD-COV"));

    var workspaces =
        Arrays.stream(http.getForEntity(base() + "/views/workspaces", Map[].class).getBody())
            .toList();
    var workspaceIds =
        workspaces.stream().map(row -> String.valueOf(row.get("workspaceId"))).toList();
    var names = workspaces.stream().map(row -> String.valueOf(row.get("name"))).toList();
    assertTrue(workspaceIds.contains(INTERIOR_WORKSPACE.toString()), workspaces.toString());
    assertTrue(workspaceIds.contains(TECHNICAL_WORKSPACE.toString()), workspaces.toString());
    assertTrue(names.contains("技术方案 Demo"), names.toString());
  }

  private int objectCount(UUID workspaceId, String objectTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM data_object object
        JOIN object_type type ON type.id = object.object_type_id
        WHERE object.workspace_id = ? AND type.code = ?
        """,
        Integer.class,
        workspaceId,
        objectTypeCode);
  }

  private int readModelCount(UUID workspaceId, String objectTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM rm_object
        WHERE workspace_id = ? AND object_type_code = ?
        """,
        Integer.class,
        workspaceId,
        objectTypeCode);
  }

  private UUID objectIdByField(
      UUID workspaceId, String objectTypeCode, String fieldCode, String expected) {
    return jdbc.queryForObject(
        """
        SELECT object_id
        FROM rm_object
        WHERE workspace_id = ? AND object_type_code = ? AND fields->>? = ?
        """,
        UUID.class,
        workspaceId,
        objectTypeCode,
        fieldCode,
        expected);
  }

  private int checkResultCount(UUID workspaceId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM check_result
        WHERE workspace_id = ? AND rule_code = ?
        """,
        Integer.class,
        workspaceId,
        ruleCode);
  }

  private void assertDecimal(String expected, Object actual) {
    assertEquals(0, new BigDecimal(expected).compareTo(new BigDecimal(String.valueOf(actual))));
  }

  private String base() {
    return "http://localhost:" + port;
  }
}
