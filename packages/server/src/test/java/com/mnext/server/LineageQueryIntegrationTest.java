package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
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
class LineageQueryIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID AUTHOR = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final UUID TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final UUID OBJECT = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  private static final UUID TARGET = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc");

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

  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM rule_def");
    jdbc.update("DELETE FROM derived_field");
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    jdbc.update("DELETE FROM workspace_member");
    jdbc.update("DELETE FROM app_user");
    jdbc.update(
        "INSERT INTO app_user (id, display_name, status) VALUES (?, 'Author', 'ACTIVE')", AUTHOR);
    jdbc.update(
        "INSERT INTO workspace_member (workspace_id, user_id, role, granted_by) VALUES (?, ?, 'AUTHOR', ?)",
        WORKSPACE,
        AUTHOR,
        AUTHOR.toString());
    insertObject(OBJECT, "manual", "{\"name\":\"Root\",\"cost\":5,\"owner_score\":2}");
    insertObject(TARGET, "artifact_sync", "{\"name\":\"Target\",\"load\":7}");
  }

  @Test
  void exposesDerivedUpstreamAlgorithmAndRuleDownstream() {
    insertDerived("total_load", "field('cost') + field('owner_score')");
    insertRule("total-load-warning", "field('total_load') > 10");

    var lineage = get("/views/lineage?objectId=" + OBJECT + "&fieldCode=total_load");

    assertEquals("derived", ((Map<?, ?>) lineage.get("algorithm")).get("kind"));
    assertFalse((Boolean) lineage.get("partial"));
    var upstream = nodes(lineage, "upstream");
    assertTrue(upstream.stream().anyMatch(node -> "cost".equals(node.get("fieldCode"))));
    assertTrue(upstream.stream().anyMatch(node -> "owner_score".equals(node.get("fieldCode"))));
    assertEquals("manual", upstream.getFirst().get("source"));
    var downstream = nodes(lineage, "downstream");
    assertTrue(downstream.stream().anyMatch(node -> "total-load-warning".equals(node.get("ref"))));
  }

  @Test
  void exposesStoredFieldWithoutInventedUpstream() {
    var lineage = get("/views/lineage?objectId=" + OBJECT + "&fieldCode=cost");

    assertEquals("stored", ((Map<?, ?>) lineage.get("algorithm")).get("kind"));
    assertTrue(nodes(lineage, "upstream").isEmpty());
  }

  @Test
  void followsAggregateTraverseInputsWithoutWritingLineage() {
    insertRelation();
    insertDerived("related_load", "sum(traverse('decomposes_to','out'),'load')");

    var lineage = get("/views/lineage?objectId=" + OBJECT + "&fieldCode=related_load");

    var upstream = nodes(lineage, "upstream");
    assertTrue(upstream.stream().anyMatch(node -> TARGET.toString().equals(node.get("objectId"))));
    assertTrue(upstream.stream().anyMatch(node -> "load".equals(node.get("fieldCode"))));
    assertEquals("artifact_sync", upstream.getFirst().get("source"));
  }

  @Test
  void marksPartialForUnparseableDefinitionsAndTruncatesBoundedResults() {
    insertDerived("partial_value", "field('cost'");
    insertDerived("deep_a", "field('deep_b')");
    insertDerived("deep_b", "field('deep_c')");
    insertDerived("deep_c", "field('deep_d')");
    insertDerived("deep_d", "field('cost')");
    for (var index = 0; index < 201; index++) {
      insertRule("cost-rule-" + index, "field('cost') > " + index);
    }

    var partial = get("/views/lineage?objectId=" + OBJECT + "&fieldCode=partial_value");
    var deep = get("/views/lineage?objectId=" + OBJECT + "&fieldCode=deep_a");
    var crowded = get("/views/lineage?objectId=" + OBJECT + "&fieldCode=cost");

    assertTrue((Boolean) partial.get("partial"));
    assertTrue((Boolean) deep.get("truncated"));
    assertEquals(200, nodes(crowded, "downstream").size());
    assertTrue((Boolean) crowded.get("truncated"));
  }

  private void insertObject(UUID objectId, String source, String fields) {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at,
           source_kind)
        VALUES (?, ?, 'demo_object', 'DRAFT', 1, ?::jsonb, now(), ?)
        """,
        WORKSPACE,
        objectId,
        fields,
        source);
  }

  private void insertDerived(String code, String derivation) {
    jdbc.update(
        """
        INSERT INTO derived_field
          (id, workspace_id, object_type_id, code, name, result_type, derivation,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'number', ?, 'test', 'test', now(), now())
        """,
        UUID.randomUUID(),
        WORKSPACE,
        TYPE,
        code,
        code,
        derivation);
  }

  private void insertRule(String code, String whenSource) {
    jdbc.update(
        """
        INSERT INTO rule_def
          (id, workspace_id, rule_code, scope_object_type_id, severity, when_src,
           message, lightweight, published, version, created_by, updated_by, created_at,
           updated_at)
        VALUES (?, ?, ?, ?, 'WARN', ?, 'message', TRUE, TRUE, 1, 'test', 'test', now(), now())
        """,
        UUID.randomUUID(),
        WORKSPACE,
        code,
        TYPE,
        whenSource);
  }

  private void insertRelation() {
    jdbc.update(
        """
        INSERT INTO rm_relation
          (workspace_id, relation_id, relation_type_code, source_id, target_id, fields,
           hierarchical, status, version, updated_at)
        VALUES (?, ?, 'decomposes_to', ?, ?, '{}'::jsonb, TRUE, 'ACTIVE', 1, now())
        """,
        WORKSPACE,
        UUID.randomUUID(),
        OBJECT,
        TARGET);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(String path) {
    var response =
        http.exchange(base() + path, HttpMethod.GET, new HttpEntity<>(null, headers()), Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> nodes(Map<String, Object> lineage, String key) {
    return (List<Map<String, Object>>) lineage.get(key);
  }

  private HttpHeaders headers() {
    var headers = new HttpHeaders();
    headers.set("X-Actor-Id", AUTHOR.toString());
    return headers;
  }

  private String base() {
    return "http://localhost:" + port + "/workspaces/" + WORKSPACE;
  }
}
