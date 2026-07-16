package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.exchange.JsonArtifact;
import com.mnext.engines.exchange.JsonArtifact.ArtifactObject;
import java.nio.file.Files;
import java.nio.file.Path;
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
import org.springframework.http.MediaType;
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
class SnapshotIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("77777777-7777-4777-8777-777777777777");
  private static final UUID OTHER = UUID.fromString("99999999-9999-4999-8999-999999999999");
  private static final UUID OBJECT = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final UUID CHILD_A = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  private static final UUID CHILD_B = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  private static final UUID GRANDCHILD = UUID.fromString("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  private static final UUID RULE_RUN = UUID.fromString("12121212-1212-4212-8212-121212121212");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired SnapshotRepository snapshots;
  @Autowired ExchangeController exchange;
  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM snapshot");
    jdbc.update("DELETE FROM check_result WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    jdbc.update("DELETE FROM relation_type WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM object_type WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM workspace WHERE id = ?", WORKSPACE);
    insertObject(WORKSPACE, OBJECT, 1, "{\"z\":2,\"a\":1}");
  }

  @Test
  void capturesListsAndGetsAnImmutableSnapshot() {
    var first = capture(WORKSPACE);
    var firstId = UUID.fromString((String) first.get("snapshotId"));
    var firstPayload = payloadText(firstId);
    var same = capture(WORKSPACE);

    assertNotNull(first.get("contentHash"));
    assertEquals(64, ((String) first.get("contentHash")).length());
    assertEquals(first.get("contentHash"), same.get("contentHash"));
    assertEquals("author", first.get("createdBy"));
    assertEquals(get(WORKSPACE, firstId), get(WORKSPACE, firstId));
    assertEquals(2, list(WORKSPACE).size());

    jdbc.update(
        """
        UPDATE rm_object SET fields = '{"a":1,"z":3}'::jsonb, version = 2
        WHERE workspace_id = ? AND object_id = ?
        """,
        WORKSPACE,
        OBJECT);
    var changed = capture(WORKSPACE);

    assertNotEquals(first.get("snapshotId"), changed.get("snapshotId"));
    assertNotEquals(first.get("contentHash"), changed.get("contentHash"));
    assertEquals(firstPayload, payloadText(firstId));
  }

  @Test
  void usesSnapshotAsDiffAndExchangePreviewBaseWhileCurrentStillWorks() throws Exception {
    var snapshot = capture(WORKSPACE);
    var snapshotId = (String) snapshot.get("snapshotId");
    jdbc.update(
        """
        UPDATE rm_object SET fields = '{"a":9,"z":2}'::jsonb, version = 2
        WHERE workspace_id = ? AND object_id = ?
        """,
        WORKSPACE,
        OBJECT);
    var current = snapshots.capture(WORKSPACE, null, "author");

    var snapshotDiff =
        postJson(
            base(WORKSPACE) + "/diff",
            Map.of(
                "base",
                "snapshot:" + snapshotId,
                "other",
                snapshots.get(WORKSPACE, current.snapshotId()).payload()));
    var currentDiff =
        postJson(
            base(WORKSPACE) + "/diff",
            Map.of(
                "base",
                "current",
                "other",
                snapshots.get(WORKSPACE, UUID.fromString(snapshotId)).payload()));
    var artifact =
        new JsonArtifact(
            1,
            WORKSPACE.toString(),
            "demo",
            List.of(new ArtifactObject("demo", Map.of("a", 9, "z", 2), OBJECT.toString())),
            List.of());
    var preview =
        exchange.preview(WORKSPACE, "snapshot:" + snapshotId, mapper.writeValueAsString(artifact));

    assertEquals(1, summary(snapshotDiff, "objectsChanged"));
    assertEquals(1, summary(currentDiff, "objectsChanged"));
    assertEquals(1, preview.summary().objectsChanged());
  }

  @Test
  void isolatesWorkspacesAndRepositoryHasNoForbiddenAccess() throws Exception {
    var snapshot = capture(WORKSPACE);
    var id = UUID.fromString((String) snapshot.get("snapshotId"));
    var response = http.getForEntity(base(OTHER) + "/snapshots/" + id, Map.class);
    var source =
        Files.readString(Path.of("src/main/java/com/mnext/server/SnapshotRepository.java"))
            .toLowerCase();

    assertEquals(400, response.getStatusCode().value());
    assertTrue(source.contains("insert into snapshot"));
    assertFalse(source.contains("kernelcommandservice"));
    assertFalse(source.contains("event_outbox"));
    assertFalse(source.contains("data_object"));
    assertFalse(source.contains("data_field_value"));
    assertFalse(source.contains("data_relation"));
    assertFalse(source.contains("update "));
    assertFalse(source.contains("delete from"));
  }

  @Test
  void scopesCaptureByObjectTypeAndBoundsListSize() {
    insertObject(WORKSPACE, UUID.randomUUID(), 1, "{\"name\":\"second demo\"}");
    jdbc.update(
        "UPDATE rm_object SET object_type_code = 'other' WHERE workspace_id = ? AND object_id <> ?",
        WORKSPACE,
        OBJECT);
    var scoped = capture(WORKSPACE, Map.of("scopeObjectType", "demo"));
    var detail = get(WORKSPACE, UUID.fromString((String) scoped.get("snapshotId")));
    var payload = (Map<?, ?>) detail.get("payload");

    assertEquals(1, ((List<?>) payload.get("objects")).size());
    assertEquals(
        400,
        http.getForEntity(base(WORKSPACE) + "/snapshots?size=51", Map.class)
            .getStatusCode()
            .value());
  }

  @Test
  void capturesTreeScopeInTreeOrderAndKeepsFlatScopeUnchanged() {
    insertTreeMetadata();
    insertObject(WORKSPACE, CHILD_A, 2, "{\"name\":\"child-a\"}");
    insertObject(WORKSPACE, CHILD_B, 3, "{\"name\":\"child-b\"}");
    insertObject(WORKSPACE, GRANDCHILD, 4, "{\"name\":\"grandchild\"}");
    insertRelation(UUID.fromString("11111111-aaaa-4aaa-8aaa-111111111111"), OBJECT, CHILD_A);
    insertRelation(UUID.fromString("22222222-bbbb-4bbb-8bbb-222222222222"), CHILD_A, GRANDCHILD);
    insertRelation(UUID.fromString("33333333-cccc-4ccc-8ccc-333333333333"), OBJECT, CHILD_B);
    insertCheckResult(GRANDCHILD, "BLOCK");

    var treeSnapshot =
        capture(
            WORKSPACE,
            Map.of(
                "treeScope", Map.of("rootId", OBJECT, "relationType", "contains", "maxDepth", 5)));
    var treePayload =
        payloadObjects(get(WORKSPACE, UUID.fromString((String) treeSnapshot.get("snapshotId"))));

    assertEquals(
        List.of(OBJECT.toString(), CHILD_A.toString(), GRANDCHILD.toString(), CHILD_B.toString()),
        treePayload.stream().map(item -> String.valueOf(item.get("objectId"))).toList());
    assertTree(treePayload.get(0), 0, null, null, 0);
    assertTree(treePayload.get(1), 1, OBJECT.toString(), "11111111-aaaa-4aaa-8aaa-111111111111", 1);
    assertTree(
        treePayload.get(2), 2, CHILD_A.toString(), "22222222-bbbb-4bbb-8bbb-222222222222", 2);
    assertEquals("OK", treeStatus(treePayload.get(0)));
    assertEquals("BLOCK", treeStatus(treePayload.get(2)));

    var flatSnapshot = capture(WORKSPACE, Map.of("scopeObjectType", "demo"));
    var flatPayload =
        payloadObjects(get(WORKSPACE, UUID.fromString((String) flatSnapshot.get("snapshotId"))));
    assertFalse(fields(flatPayload.getFirst()).containsKey("_tree"));
  }

  @Test
  void capturesConfiguredSideRelationsWithSnapshotRelationState() {
    insertTreeMetadata();
    var quote = UUID.fromString("eeeeeeee-aaaa-4eee-8eee-eeeeeeeeeeee");
    insertObject(WORKSPACE, quote, 3, "{\"name\":\"quote-a\"}");
    jdbc.update(
        """
        INSERT INTO relation_type
          (id, workspace_id, code, source_type, target_type, direction, cardinality,
           semantics, hierarchical, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'uses_quote', ?, ?, 'directed', 'many_to_many', 'weak', FALSE,
          'test', 'test', now(), now())
        """,
        UUID.fromString("eeeeeeee-bbbb-4eee-8eee-eeeeeeeeeeee"),
        WORKSPACE,
        UUID.fromString("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
        UUID.fromString("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"));
    jdbc.update(
        """
        INSERT INTO rm_relation
          (workspace_id, relation_id, relation_type_code, source_id, target_id, fields,
           hierarchical, status, version, updated_at)
        VALUES (?, ?, 'uses_quote', ?, ?, '{}'::jsonb, FALSE, 'ACTIVE', 4, now())
        """,
        WORKSPACE,
        UUID.fromString("eeeeeeee-cccc-4eee-8eee-eeeeeeeeeeee"),
        OBJECT,
        quote);

    var snapshot =
        capture(
            WORKSPACE,
            Map.of(
                "treeScope",
                Map.of(
                    "rootId",
                    OBJECT,
                    "relationType",
                    "contains",
                    "relatedRelationTypes",
                    List.of("uses_quote"))));
    var payload = get(WORKSPACE, UUID.fromString((String) snapshot.get("snapshotId")));
    var data = (Map<?, ?>) payload.get("payload");

    assertTrue(
        payloadObjects(payload).stream()
            .anyMatch(item -> quote.toString().equals(item.get("objectId"))));
    var relation = ((List<Map<?, ?>>) data.get("relations")).getFirst();
    var fields = (Map<?, ?>) relation.get("fields");
    var state = (Map<?, ?>) fields.get("_snapshot");
    assertEquals("ACTIVE", state.get("status"));
    assertEquals(4, ((Number) state.get("version")).intValue());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> capture(UUID workspace) {
    return capture(workspace, Map.of());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> capture(UUID workspace, Object body) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "author");
    var response =
        http.postForEntity(
            base(workspace) + "/snapshots", new HttpEntity<>(body, headers), Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(UUID workspace, UUID snapshotId) {
    var response = http.getForEntity(base(workspace) + "/snapshots/" + snapshotId, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> list(UUID workspace) {
    var response = http.getForEntity(base(workspace) + "/snapshots?size=50", Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (List<Map<String, Object>>) response.getBody().get("items");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> postJson(String url, Object body) {
    var response = http.postForEntity(url, body, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private int summary(Map<String, Object> response, String name) {
    return ((Number) ((Map<?, ?>) response.get("summary")).get(name)).intValue();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> payloadObjects(Map<String, Object> detail) {
    return (List<Map<String, Object>>) ((Map<?, ?>) detail.get("payload")).get("objects");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> fields(Map<String, Object> object) {
    return (Map<String, Object>) object.get("fields");
  }

  private void assertTree(
      Map<String, Object> object, int depth, String parentId, String relationId, int order) {
    var tree = (Map<?, ?>) fields(object).get("_tree");
    assertEquals(depth, ((Number) tree.get("depth")).intValue());
    assertEquals(order, ((Number) tree.get("order")).intValue());
    if (parentId == null) {
      assertNull(tree.get("parentId"));
    } else {
      assertEquals(parentId, tree.get("parentId"));
    }
    if (relationId == null) {
      assertNull(tree.get("relationId"));
    } else {
      assertEquals(relationId, tree.get("relationId"));
    }
  }

  private String payloadText(UUID snapshotId) {
    return jdbc.queryForObject(
        "SELECT payload::text FROM snapshot WHERE snapshot_id = ?", String.class, snapshotId);
  }

  private void insertTreeMetadata() {
    var type = UUID.fromString("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    var relation = UUID.fromString("ffffffff-ffff-4fff-8fff-ffffffffffff");
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, 'Snapshot workspace', 'ACTIVE')",
        WORKSPACE);
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, code, name, published, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'demo', 'Demo', TRUE, 'test', 'test', now(), now())
        """,
        type,
        WORKSPACE);
    jdbc.update(
        """
        INSERT INTO relation_type
          (id, workspace_id, code, source_type, target_type, direction, cardinality,
           semantics, hierarchical, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, 'contains', ?, ?, 'directed', 'many_to_many', 'strong', TRUE,
          'test', 'test', now(), now())
        """,
        relation,
        WORKSPACE,
        type,
        type);
  }

  private void insertObject(UUID workspace, UUID objectId, long version, String fields) {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, 'demo', 'DRAFT', ?, CAST(? AS jsonb), now())
        """,
        workspace,
        objectId,
        version,
        fields);
  }

  private void insertRelation(UUID relationId, UUID sourceId, UUID targetId) {
    jdbc.update(
        """
        INSERT INTO rm_relation
          (workspace_id, relation_id, relation_type_code, source_id, target_id, fields,
           hierarchical, status, version, updated_at)
        VALUES (?, ?, 'contains', ?, ?, '{}'::jsonb, TRUE, 'ACTIVE', 1, now())
        """,
        WORKSPACE,
        relationId,
        sourceId,
        targetId);
  }

  private void insertCheckResult(UUID objectId, String severity) {
    jdbc.update(
        """
        INSERT INTO check_result
          (id, workspace_id, run_id, rule_code, severity, message,
           object_id, field_code, config_hash, created_at)
        VALUES (?, ?, ?, 'R-TREE', ?, '树快照校核', ?, NULL,
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now())
        """,
        UUID.randomUUID(),
        WORKSPACE,
        RULE_RUN,
        severity,
        objectId);
  }

  private String treeStatus(Map<String, Object> object) {
    return String.valueOf(((Map<?, ?>) fields(object).get("_tree")).get("ruleStatus"));
  }

  private String base(UUID workspace) {
    return "http://localhost:" + port + "/workspaces/" + workspace;
  }
}
