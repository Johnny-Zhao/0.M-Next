package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
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
    properties = {"mnext.outbox.enabled=false"})
class GoldenPathE2ETest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final String REQ_TYPE = "quality_requirement";
  private static final String FUNC_TYPE = "quality_function";
  private static final String TREE_REL = "quality_breakdown";
  private static final String TRACE_REL = "quality_trace";

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
  @Autowired ObjectMapper mapper;
  @Autowired ReadModelProjection projection;
  @LocalServerPort int port;

  @BeforeEach
  void resetQualityScenario() {
    jdbc.update("DELETE FROM output_snapshot WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM snapshot WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM annotation WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM review_round WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM rm_consumed_event");
    jdbc.update("DELETE FROM rm_relation WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM rm_object WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM relation_closure");
    jdbc.update("DELETE FROM relation_history");
    jdbc.update("DELETE FROM data_relation WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update(
        "DELETE FROM data_field_value USING data_object WHERE object_id = data_object.id AND data_object.workspace_id = ?",
        WORKSPACE);
    jdbc.update("DELETE FROM data_object WHERE workspace_id = ?", WORKSPACE);
    jdbc.update("DELETE FROM event_outbox");
    jdbc.update("DELETE FROM command_log WHERE workspace_id = ?", WORKSPACE);
    jdbc.update(
        "DELETE FROM relation_type WHERE workspace_id = ? AND code IN (?, ?)",
        WORKSPACE,
        TREE_REL,
        TRACE_REL);
    jdbc.update(
        """
        DELETE FROM field_def WHERE object_type_id IN (
          SELECT id FROM object_type WHERE workspace_id = ? AND code IN (?, ?)
        )
        """,
        WORKSPACE,
        REQ_TYPE,
        FUNC_TYPE);
    jdbc.update(
        "DELETE FROM object_type WHERE workspace_id = ? AND code IN (?, ?)",
        WORKSPACE,
        REQ_TYPE,
        FUNC_TYPE);
  }

  @Test
  void goldenPathCoversCommandsViewsReviewExchangeSnapshotAndOutput() throws Exception {
    defineMetaModel();
    var requirementType = objectTypeId(REQ_TYPE);
    var functionType = objectTypeId(FUNC_TYPE);
    var breakdownType = relationTypeId(TREE_REL);
    var traceType = relationTypeId(TRACE_REL);

    var root =
        createObject("root", requirementType, Map.of("name", "Root requirement", "cost", 10));
    var child =
        createObject("child", requirementType, Map.of("name", "Child requirement", "cost", 3));
    var function = createObject("function", functionType, Map.of("name", "Search", "owner", "Ada"));
    createRelation("breakdown", breakdownType, root, child);
    createRelation("trace", traceType, root, function);
    updateField("prime-root-name", root, 1, "name", "Root requirement baseline", 1L);
    projectOutbox();

    assertViews(root);
    var traceRelation = relationId(traceType, root, function);
    assertReviewAnnotations(root, traceRelation);

    var artifact = exportedArtifact();
    mutateArtifact(artifact, root);
    var preview = postJson(base() + "/exchange/json/preview", artifact);
    assertEquals(1, summary(preview, "objectsChanged"));
    assertEquals(1, summary(preview, "objectsAdded"));
    var applied =
        postJson(
            base() + "/exchange/json/apply",
            Map.of("artifact", artifact, "confirmRemovals", false));
    assertFalse(list(applied, "applied").isEmpty());
    assertTrue(list(applied, "unapplied").isEmpty(), String.valueOf(applied));
    projectOutbox();

    var detail = get("/views/objects/" + root);
    assertEquals("Root requirement v2", fields(detail).get("name"));
    assertEquals(4, count("data_object"));
    assertEquals(8, countM1Commands());

    var snapshot = postJson(base() + "/snapshots", Map.of());
    var output =
        postJson(
            base() + "/outputs",
            Map.of(
                "snapshotId",
                snapshot.get("snapshotId"),
                "format",
                "html",
                "objectType",
                REQ_TYPE,
                "fieldOrder",
                List.of("name", "cost")));
    var rendered = get("/outputs/" + output.get("outputId"));
    var html =
        new String(
            Base64.getDecoder().decode((String) rendered.get("artifact")), StandardCharsets.UTF_8);

    assertTrue(html.contains("Root requirement v2"));
    assertEquals(4, count("data_object"));
    assertEquals(2, count("data_relation"));
  }

  private void defineMetaModel() {
    postMeta(
        "DefineObjectType", "meta-req", Map.of("code", REQ_TYPE, "name", "Quality Requirement"));
    postMeta(
        "DefineObjectType", "meta-func", Map.of("code", FUNC_TYPE, "name", "Quality Function"));
    var requirementType = objectTypeId(REQ_TYPE);
    var functionType = objectTypeId(FUNC_TYPE);
    postMeta(
        "DefineFieldDef",
        "meta-req-name",
        Map.of(
            "objectTypeId",
            requirementType,
            "code",
            "name",
            "name",
            "Name",
            "dataType",
            "string",
            "required",
            true));
    postMeta(
        "DefineFieldDef",
        "meta-req-cost",
        Map.of(
            "objectTypeId", requirementType, "code", "cost", "name", "Cost", "dataType", "number"));
    postMeta(
        "DefineFieldDef",
        "meta-func-name",
        Map.of(
            "objectTypeId",
            functionType,
            "code",
            "name",
            "name",
            "Name",
            "dataType",
            "string",
            "required",
            true));
    postMeta(
        "DefineFieldDef",
        "meta-func-owner",
        Map.of(
            "objectTypeId", functionType, "code", "owner", "name", "Owner", "dataType", "string"));
    postMeta(
        "DefineRelationType",
        "meta-breakdown",
        Map.of(
            "code",
            TREE_REL,
            "name",
            "Breakdown",
            "sourceTypeId",
            requirementType,
            "targetTypeId",
            requirementType,
            "direction",
            "directed",
            "cardinality",
            "one_to_many",
            "semantics",
            "strong",
            "hierarchical",
            true));
    postMeta(
        "DefineRelationType",
        "meta-trace",
        Map.of(
            "code",
            TRACE_REL,
            "name",
            "Trace",
            "sourceTypeId",
            requirementType,
            "targetTypeId",
            functionType,
            "direction",
            "directed",
            "cardinality",
            "many_to_many",
            "semantics",
            "weak",
            "hierarchical",
            false));
    jdbc.update(
        "UPDATE object_type SET published = TRUE WHERE workspace_id = ? AND code IN (?, ?)",
        WORKSPACE,
        REQ_TYPE,
        FUNC_TYPE);
  }

  private UUID createObject(String key, UUID objectType, Map<String, Object> fields) {
    var response =
        postCommand(
            "CreateObject",
            "create-" + key,
            Map.of(
                "objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
    assertFalse((Boolean) response.get("idempotentReplay"));
    return createdObjectId((List<?>) response.get("events"));
  }

  private void createRelation(String key, UUID relationType, UUID source, UUID target) {
    postCommand(
        "CreateRelation",
        "rel-" + key,
        Map.of(
            "relationTypeId", relationType,
            "sourceId", source,
            "targetId", target,
            "relationFields", Map.of("weight", 1),
            "source", Map.of("type", "manual")));
  }

  private void updateField(
      String key, UUID objectId, long objectVersion, String fieldCode, Object value, Long version) {
    var field = new LinkedHashMap<String, Object>();
    field.put("fieldDefCode", fieldCode);
    field.put("value", value);
    field.put("expectedFieldVersion", version);
    postCommand(
        "UpdateFields",
        key,
        Map.of(
            "objectId",
            objectId,
            "expectedObjectVersion",
            objectVersion,
            "fields",
            List.of(field)));
  }

  private void assertViews(UUID root) {
    var objects = get("/views/objects?objectType=" + REQ_TYPE + "&page=0&pageSize=10");
    var tree = getList("/views/tree?relationType=" + TREE_REL + "&rootId=" + root);
    var matrix =
        get(
            "/views/matrix?rowType="
                + REQ_TYPE
                + "&colType="
                + FUNC_TYPE
                + "&relationType="
                + TRACE_REL
                + "&rowSize=50&colSize=50");
    var relations =
        getList(
            "/views/relations?relationType="
                + TRACE_REL
                + "&direction=out&sourceId="
                + root
                + "&depth=1");

    assertEquals(2, ((Number) objects.get("total")).intValue());
    assertEquals(1, tree.size());
    assertEquals(1, list(matrix, "cells").size());
    assertEquals(1, relations.size());
  }

  private void assertReviewAnnotations(UUID root, UUID traceRelation) {
    postReview(
        "CreateAnnotation",
        Map.of(
            "targetType",
            "object",
            "targetId",
            root,
            "anchoredDataVersion",
            2,
            "severity",
            "info",
            "body",
            "object note"));
    postReview(
        "CreateAnnotation",
        Map.of(
            "targetType",
            "field",
            "targetId",
            root,
            "fieldCode",
            "name",
            "anchoredDataVersion",
            2,
            "severity",
            "issue",
            "body",
            "field note"));
    postReview(
        "CreateAnnotation",
        Map.of(
            "targetType",
            "relation",
            "targetId",
            traceRelation,
            "anchoredDataVersion",
            1,
            "severity",
            "suggest",
            "body",
            "relation note"));

    var annotations =
        http.getForEntity(
            base() + "/annotations?targetType=field&targetId=" + root + "&fieldCode=name",
            Object[].class);
    assertEquals(200, annotations.getStatusCode().value());
    assertEquals(1, annotations.getBody().length);
    assertEquals(3, count("annotation"));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> exportedArtifact() {
    return http.getForEntity(base() + "/exchange/json/export", Map.class).getBody();
  }

  @SuppressWarnings("unchecked")
  private void mutateArtifact(Map<String, Object> artifact, UUID root) {
    var objects = (List<Map<String, Object>>) artifact.get("objects");
    for (var object : objects) {
      if (root.toString().equals(object.get("key"))) {
        var fields = new LinkedHashMap<String, Object>((Map<String, Object>) object.get("fields"));
        fields.put("name", "Root requirement v2");
        object.put("fields", fields);
      }
    }
    objects.add(
        Map.of(
            "objectTypeCode",
            REQ_TYPE,
            "fields",
            Map.of("name", "Imported requirement", "cost", 5),
            "key",
            "imported-requirement"));
  }

  private void projectOutbox() throws Exception {
    var events =
        jdbc.queryForList(
            """
            SELECT payload::text FROM event_outbox
            ORDER BY CASE event_type
                WHEN 'ObjectCreated' THEN 1
                WHEN 'FieldChanged' THEN 2
                WHEN 'StateChanged' THEN 3
                WHEN 'RelationCreated' THEN 4
                ELSE 9
              END,
              created_at,
              aggregate_id,
              sequence
            """,
            String.class);
    for (var payload : events) {
      projection.apply(mapper.readValue(payload, EventEnvelope.class));
    }
  }

  private Map<String, Object> postMeta(
      String commandType, String key, Map<String, Object> payload) {
    return post(base() + "/meta-commands", commandType, key, payload);
  }

  private Map<String, Object> postCommand(
      String commandType, String key, Map<String, Object> payload) {
    return post(base() + "/commands", commandType, key, payload);
  }

  private Map<String, Object> postReview(String commandType, Map<String, Object> payload) {
    return post(base() + "/review/commands", commandType, UUID.randomUUID().toString(), payload);
  }

  private Map<String, Object> post(
      String url, String commandType, String key, Map<String, Object> payload) {
    return postJson(url, envelope(commandType, key, payload));
  }

  private Map<String, Object> envelope(
      String commandType, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("commandType", commandType);
    request.put("workspaceId", WORKSPACE.toString());
    request.put("correlationId", UUID.randomUUID().toString());
    request.put("idempotencyKey", key);
    request.put("payload", payload);
    return request;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> postJson(String url, Object body) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "golden-user");
    var response = http.postForEntity(url, new HttpEntity<>(body, headers), Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> get(String path) {
    var response = http.getForEntity(base() + path, Map.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> getList(String path) {
    var response = http.getForEntity(base() + path, List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return response.getBody();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> list(Map<String, Object> value, String key) {
    return (List<Map<String, Object>>) value.get(key);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> fields(Map<String, Object> detail) {
    return (Map<String, Object>) ((Map<String, Object>) detail.get("object")).get("fields");
  }

  private int summary(Map<String, Object> response, String name) {
    return ((Number) ((Map<?, ?>) response.get("summary")).get(name)).intValue();
  }

  private UUID objectTypeId(String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        WORKSPACE,
        code);
  }

  private UUID relationTypeId(String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        WORKSPACE,
        code);
  }

  private UUID relationId(UUID relationType, UUID source, UUID target) {
    return jdbc.queryForObject(
        "SELECT id FROM data_relation WHERE relation_type_id = ? AND source_id = ? AND target_id = ?",
        UUID.class,
        relationType,
        source,
        target);
  }

  private UUID createdObjectId(List<?> eventIds) {
    assertNotNull(eventIds);
    var eventId = eventIds.getFirst().toString();
    return UUID.fromString(
        jdbc.queryForObject(
            "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
            String.class,
            eventId));
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private int countM1Commands() {
    return jdbc.queryForObject(
        """
        SELECT count(*) FROM command_log
        WHERE workspace_id = ?
          AND command_type IN ('CreateObject', 'CreateRelation', 'UpdateFields')
        """,
        Integer.class,
        WORKSPACE);
  }

  private String base() {
    return "http://localhost:" + port + "/workspaces/" + WORKSPACE;
  }
}
