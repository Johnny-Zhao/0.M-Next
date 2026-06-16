package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.events.EventEnvelope;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
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
class ReadModelQueryIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID FIRST = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  private static final UUID SECOND = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  private static final UUID RELATION = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  private static final UUID BASE_TYPE = UUID.fromString("55555555-5555-4555-8555-555555555551");
  private static final UUID CHILD_TYPE = UUID.fromString("55555555-5555-4555-8555-555555555552");
  private static final UUID NATURAL_TEXT_TYPE =
      UUID.fromString("66666666-6666-4666-8666-666666666662");
  private static final UUID REQUIREMENT_TEXT_TYPE =
      UUID.fromString("66666666-6666-4666-8666-666666666663");
  private static final AtomicInteger IDS = new AtomicInteger();

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired ReadModelProjection projection;
  @Autowired TestRestTemplate http;
  @Autowired JdbcTemplate jdbc;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM rm_consumed_event");
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    jdbc.update("DELETE FROM event_outbox");
  }

  @Test
  void projectsAndQueriesPagedObjectsRelationsTreeAndSyncStatus() {
    projection.apply(objectCreated(FIRST));
    projection.apply(objectCreated(SECOND));
    projection.apply(fieldChanged(FIRST, 2, 5));
    projection.apply(relationCreated());
    projection.apply(stateChanged(FIRST, 3, "CONFIRMED"));
    projection.apply(stateChanged(FIRST, 2, "DRAFT"));

    var objects = get("/views/objects?objectType=demo_object&page=0&pageSize=1");
    var relations =
        getList(
            "/views/relations?relationType=decomposes_to&direction=out&sourceId="
                + FIRST
                + "&depth=1");
    var tree = getList("/views/tree?relationType=decomposes_to&rootId=" + FIRST);
    var types = getList("/views/object-types");
    var detail = get("/views/objects/" + FIRST);
    var sync = get("/views/sync-status");

    assertEquals(2, ((Number) objects.get("total")).intValue());
    assertEquals(1, ((java.util.List<?>) objects.get("items")).size());
    assertEquals(1, relations.size());
    assertEquals(1, tree.size());
    assertFalse(types.isEmpty());
    assertEquals("CONFIRMED", ((Map<?, ?>) detail.get("object")).get("status"));
    assertEquals(0, ((Number) sync.get("pendingEvents")).intValue());
    assertTrue((Boolean) sync.get("caughtUp"));
  }

  @Test
  void duplicateAndOldEventsDoNotOverwriteNewerProjection() {
    var created = objectCreated(FIRST);
    projection.apply(created);
    projection.apply(created);
    projection.apply(fieldChanged(FIRST, 3, 9));
    projection.apply(fieldChanged(FIRST, 2, 1));

    assertEquals(
        "9",
        jdbc.queryForObject(
            "SELECT fields->>'budget' FROM rm_object WHERE workspace_id = ? AND object_id = ?",
            String.class,
            WORKSPACE,
            FIRST));
    assertEquals(3, count("rm_consumed_event"));
  }

  @Test
  void validatesRequiredScopeAndSyncPendingCount() {
    jdbc.update(
        """
        INSERT INTO event_outbox
          (id, event_type, aggregate_type, aggregate_id, sequence, payload, created_at)
        VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FF1', 'ObjectCreated', 'object', ?, 1,
          CAST(? AS jsonb), now())
        """,
        FIRST.toString(),
        "{\"workspaceId\":\"" + WORKSPACE + "\"}");

    assertEquals(400, status("/views/objects?objectType=demo_object&pageSize=201"));
    assertEquals(400, status("/views/relations?relationType=x&direction=all&sourceId=" + FIRST));
    assertEquals(1, ((Number) get("/views/sync-status").get("pendingEvents")).intValue());
  }

  @Test
  void objectTypesExposeEffectiveInheritedRedefinedAndValueTypeFields() {
    insertEffectiveFieldTypes();

    var types = getList("/views/object-types");
    var child =
        types.stream()
            .filter(type -> "performance_requirement".equals(type.get("code")))
            .findFirst()
            .orElseThrow();
    var fields = fieldsByCode(child);

    assertTrue(fields.containsKey("name"));
    assertEquals("Name", fields.get("name").get("name"));
    assertEquals("string", fields.get("name").get("dataType"));
    assertEquals("Priority (tight)", fields.get("priority").get("name"));
    assertTrue((Boolean) fields.get("priority").get("required"));
    assertEquals(5, ((Number) constraints(fields.get("priority")).get("max")).intValue());
    assertEquals("text", fields.get("description").get("dataType"));
    assertEquals(5, ((Number) constraints(fields.get("description")).get("minLength")).intValue());
    assertEquals(
        120, ((Number) constraints(fields.get("description")).get("maxLength")).intValue());
    assertEquals("REQ-.*", constraints(fields.get("description")).get("pattern"));
    assertTrue((Boolean) constraints(fields.get("description")).get("multiline"));
  }

  @Test
  void diffsWorkspaceScopedCurrentReadModel() {
    projection.apply(objectCreated(FIRST));

    var response =
        http.postForEntity(
            base() + "/diff",
            Map.of(
                "base",
                "current",
                "other",
                Map.of("objects", java.util.List.of(), "relations", java.util.List.of())),
            Map.class);

    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    var summary = (Map<?, ?>) response.getBody().get("summary");
    assertEquals(1, ((Number) summary.get("objectsRemoved")).intValue());
    assertEquals(0, ((Number) summary.get("objectsAdded")).intValue());
  }

  @Test
  void diffsTwoProvidedDataSetsOverHttp() {
    var first =
        Map.of(
            "objectId",
            "one",
            "objectTypeCode",
            "demo",
            "fields",
            Map.of(),
            "status",
            "DRAFT",
            "version",
            1);
    var second =
        Map.of(
            "objectId",
            "two",
            "objectTypeCode",
            "demo",
            "fields",
            Map.of(),
            "status",
            "DRAFT",
            "version",
            1);

    var response =
        http.postForEntity(
            base() + "/diff",
            Map.of(
                "a", Map.of("objects", java.util.List.of(first), "relations", java.util.List.of()),
                "b",
                    Map.of("objects", java.util.List.of(second), "relations", java.util.List.of())),
            Map.class);

    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    var summary = (Map<?, ?>) response.getBody().get("summary");
    assertEquals(1, ((Number) summary.get("objectsAdded")).intValue());
    assertEquals(1, ((Number) summary.get("objectsRemoved")).intValue());
  }

  private EventEnvelope objectCreated(UUID objectId) {
    return event(
        "ObjectCreated",
        "object",
        objectId.toString(),
        1,
        Map.of(
            "objectId", objectId.toString(),
            "objectTypeId", "22222222-2222-4222-8222-222222222222",
            "status", "DRAFT"));
  }

  private EventEnvelope fieldChanged(UUID objectId, long version, Object value) {
    return event(
        "FieldChanged",
        "fieldValue",
        objectId + ":budget",
        version,
        Map.of("fieldDefCode", "budget", "value", value));
  }

  private EventEnvelope stateChanged(UUID objectId, long version, String status) {
    return event("StateChanged", "object", objectId.toString(), version, Map.of("status", status));
  }

  private EventEnvelope relationCreated() {
    return event(
        "RelationCreated",
        "relation",
        RELATION.toString(),
        1,
        Map.of(
            "relationTypeId",
            "44444444-4444-4444-8444-444444444442",
            "sourceId",
            FIRST.toString(),
            "targetId",
            SECOND.toString(),
            "fields",
            Map.of()));
  }

  private EventEnvelope event(
      String eventType,
      String targetType,
      String targetId,
      long version,
      Map<String, Object> after) {
    return new EventEnvelope(
        eventId(),
        eventType,
        1,
        WORKSPACE,
        targetType,
        targetId,
        version,
        null,
        after,
        Actor.user("actor"),
        "manual",
        Instant.now(),
        UUID.randomUUID(),
        "command",
        version,
        null);
  }

  private String eventId() {
    return "01ARZ3NDEKTSV4RRFFQ69" + String.format("%05d", IDS.incrementAndGet());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(String path) {
    var response = http.getForEntity(base() + path, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private java.util.List<Map<String, Object>> getList(String path) {
    var response = http.getForEntity(base() + path, java.util.List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  private int status(String path) {
    return http.getForEntity(base() + path, Map.class).getStatusCode().value();
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private void insertEffectiveFieldTypes() {
    var rootTextType =
        jdbc.queryForObject(
            "SELECT id FROM value_type WHERE workspace_id = ? AND code = 'text'",
            UUID.class,
            WORKSPACE);
    jdbc.update("DELETE FROM field_def WHERE object_type_id IN (?, ?)", BASE_TYPE, CHILD_TYPE);
    jdbc.update("DELETE FROM object_type WHERE id IN (?, ?)", CHILD_TYPE, BASE_TYPE);
    jdbc.update(
        "DELETE FROM value_type WHERE id IN (?, ?)", REQUIREMENT_TEXT_TYPE, NATURAL_TEXT_TYPE);
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, code, name, parent_type_id, published,
           created_by, updated_by, created_at, updated_at)
        VALUES
          (?, ?, 'base_requirement', 'Base Requirement', NULL, TRUE,
           'test', 'test', now(), now()),
          (?, ?, 'performance_requirement', 'Performance Requirement', ?, TRUE,
           'test', 'test', now(), now())
        """,
        BASE_TYPE,
        WORKSPACE,
        CHILD_TYPE,
        WORKSPACE,
        BASE_TYPE);
    jdbc.update(
        """
        INSERT INTO value_type
          (id, workspace_id, code, name, base_primitive, parent_value_type_id,
           constraints, published, version)
        VALUES
          (?, ?, 'natural_text_test', 'Natural Text', 'text', ?, ?::jsonb, TRUE, 1),
          (?, ?, 'requirement_text_test', 'Requirement Text', 'text', ?, ?::jsonb, TRUE, 1)
        """,
        NATURAL_TEXT_TYPE,
        WORKSPACE,
        rootTextType,
        "{\"maxLength\":200,\"multiline\":true}",
        REQUIREMENT_TEXT_TYPE,
        WORKSPACE,
        NATURAL_TEXT_TYPE,
        "{\"maxLength\":120,\"pattern\":\"REQ-.*\"}");
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, code, name, required, data_type, value_type_id,
           constraints, created_by, updated_by, created_at, updated_at)
        VALUES
          ('77777777-7777-4777-8777-777777777771', ?, 'name', 'Name', TRUE,
           'string', NULL, '{}'::jsonb, 'test', 'test', now(), now()),
          ('77777777-7777-4777-8777-777777777772', ?, 'priority', 'Priority', FALSE,
           'number', NULL, '{"max":10}'::jsonb, 'test', 'test', now(), now()),
          ('77777777-7777-4777-8777-777777777773', ?, 'description', 'Description', FALSE,
           'text', ?, '{"minLength":5}'::jsonb, 'test', 'test', now(), now()),
          ('77777777-7777-4777-8777-777777777774', ?, 'priority', 'Priority (tight)', TRUE,
           'number', NULL, '{"max":5}'::jsonb, 'test', 'test', now(), now())
        """,
        BASE_TYPE,
        BASE_TYPE,
        BASE_TYPE,
        REQUIREMENT_TEXT_TYPE,
        CHILD_TYPE);
  }

  private Map<String, Map<String, Object>> fieldsByCode(Map<String, Object> type) {
    var fields = new java.util.LinkedHashMap<String, Map<String, Object>>();
    for (var field : (java.util.List<Map<String, Object>>) type.get("fields")) {
      fields.put((String) field.get("code"), field);
    }
    return fields;
  }

  private Map<String, Object> constraints(Map<String, Object> field) {
    return (Map<String, Object>) field.get("constraints");
  }

  private String base() {
    return "http://localhost:" + port + "/workspaces/" + WORKSPACE;
  }
}
