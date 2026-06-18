package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
class TransformationIntegrationTest {
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

  @Test
  void definesTransformationAndRejectsInvalidMappings() {
    var workspace = UUID.randomUUID();
    insertWorkspace(workspace);
    var ids = insertBlockToBusMeta(workspace);

    var accepted = postMeta(workspace, "DefineTransformation", "define-transform", mapping());
    assertOk(accepted);
    var replay = postMeta(workspace, "DefineTransformation", "define-transform", mapping());
    assertOk(replay);
    assertTrue((Boolean) replay.getBody().get("idempotentReplay"));

    var syntax =
        postMeta(
            workspace,
            "DefineTransformation",
            "define-transform-syntax",
            mappingWithExpression("field("));
    assertEquals(400, syntax.getStatusCode().value(), String.valueOf(syntax.getBody()));
    assertError("M2M-400-MAPPING-INVALID", syntax);

    var unknown =
        postMeta(
            workspace,
            "DefineTransformation",
            "define-transform-unknown",
            Map.of(
                "code",
                "bad_codes",
                "name",
                "Bad Codes",
                "correspondenceRelationCode",
                "realizes",
                "objectMappings",
                List.of(
                    Map.of(
                        "sourceTypeCode",
                        "missing_block",
                        "targetTypeCode",
                        "bus_node",
                        "fieldMappings",
                        List.of())),
                "relationMappings",
                List.of()));
    assertEquals(400, unknown.getStatusCode().value(), String.valueOf(unknown.getBody()));
    assertError("M2M-400-MAPPING-INVALID", unknown);
    assertFalse(ids.isEmpty());
  }

  @Test
  void runsTransformationAndIdempotentlySkipsExistingSources() throws Exception {
    var workspace = UUID.randomUUID();
    insertWorkspace(workspace);
    var ids = insertBlockToBusMeta(workspace);
    assertOk(postMeta(workspace, "DefineTransformation", "define-transform", mapping()));
    var first = createBlock(workspace, ids.blockType(), "Battery", 40, "create-battery");
    var second = createBlock(workspace, ids.blockType(), "Motor", 60, "create-motor");
    createRelation(workspace, ids.connectorType(), first, second, "create-connector");
    projectOutbox();

    assertOk(postMeta(workspace, "RunTransformation", "run-transform-1", runPayload()));
    projectOutbox();

    assertEquals(2, countObjects(workspace, ids.nodeType()));
    assertEquals(1, countRelations(workspace, ids.linkType()));
    assertEquals(2, countRelations(workspace, ids.correspondenceType()));
    assertEquals(2, provenanceCount(workspace));
    assertEquals("40", targetValue(workspace, ids.nodeType(), "Battery", "capacity"));
    assertEquals("60", targetValue(workspace, ids.nodeType(), "Motor", "capacity"));

    assertOk(postMeta(workspace, "RunTransformation", "run-transform-2", runPayload()));
    projectOutbox();

    assertEquals(2, countObjects(workspace, ids.nodeType()));
    assertEquals(1, countRelations(workspace, ids.linkType()));
    assertEquals(2, countRelations(workspace, ids.correspondenceType()));
    assertEquals(2, provenanceCount(workspace));
  }

  @Test
  void rejectsSourceObjectSetBeyondLimit() {
    var workspace = UUID.randomUUID();
    insertWorkspace(workspace);
    insertBlockToBusMeta(workspace);
    assertOk(postMeta(workspace, "DefineTransformation", "define-transform", mapping()));
    for (var index = 0; index < TransformationRunner.MAX_SOURCE_OBJECTS + 1; index++) {
      insertReadObject(workspace, "sysml_block", Map.of("name", "B" + index, "bandwidth", index));
    }

    var response = postMeta(workspace, "RunTransformation", "run-too-many", runPayload());

    assertEquals(422, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertError("M2M-422-SOURCE-UNRESOLVED", response);
  }

  @Test
  void skipsRelationMappingWhenEitherEndpointWasNotGenerated() throws Exception {
    var workspace = UUID.randomUUID();
    insertWorkspace(workspace);
    var ids = insertBlockToBusMeta(workspace);
    var externalType = insertObjectType(workspace, "external_port", "External Port");
    var externalRelation =
        insertRelationType(workspace, "external_connector", ids.blockType(), externalType);
    assertOk(
        postMeta(
            workspace,
            "DefineTransformation",
            "define-transform",
            Map.of(
                "code",
                "ibd_to_bus",
                "name",
                "IBD to Bus",
                "correspondenceRelationCode",
                "realizes",
                "objectMappings",
                List.of(objectMapping()),
                "relationMappings",
                List.of(
                    Map.of(
                        "sourceRelationCode",
                        "external_connector",
                        "targetRelationCode",
                        "bus_link")))));
    var block = createBlock(workspace, ids.blockType(), "Mapped", 10, "create-mapped");
    projectOutbox();
    var external = insertReadObject(workspace, "external_port", Map.of("name", "Unmapped"));
    insertReadRelation(workspace, externalRelation, "external_connector", block, external);

    assertOk(postMeta(workspace, "RunTransformation", "run-skip", runPayload()));

    assertEquals(1, countObjects(workspace, ids.nodeType()));
    assertEquals(0, countRelations(workspace, ids.linkType()));
    assertEquals(1, provenanceCount(workspace));
  }

  private Map<String, Object> mapping() {
    return mappingWithExpression("field('bandwidth')");
  }

  private Map<String, Object> mappingWithExpression(String expression) {
    return Map.of(
        "code",
        "ibd_to_bus",
        "name",
        "IBD to Bus",
        "correspondenceRelationCode",
        "realizes",
        "objectMappings",
        List.of(objectMapping(expression)),
        "relationMappings",
        List.of(Map.of("sourceRelationCode", "connector", "targetRelationCode", "bus_link")));
  }

  private Map<String, Object> objectMapping() {
    return objectMapping("field('bandwidth')");
  }

  private Map<String, Object> objectMapping(String expression) {
    return Map.of(
        "sourceTypeCode",
        "sysml_block",
        "targetTypeCode",
        "bus_node",
        "fieldMappings",
        List.of(
            Map.of("targetFieldCode", "name", "expression", "field('name')"),
            Map.of("targetFieldCode", "capacity", "expression", expression)));
  }

  private Map<String, Object> runPayload() {
    return Map.of("transformationCode", "ibd_to_bus");
  }

  private UUID createBlock(
      UUID workspace, UUID objectType, String name, int bandwidth, String key) {
    var response =
        postCommand(
            workspace,
            "CreateObject",
            key,
            Map.of(
                "objectTypeId",
                objectType,
                "fields",
                Map.of("name", name, "bandwidth", bandwidth),
                "source",
                Map.of("type", "manual")));
    assertOk(response);
    return createdObjectId(response.getBody());
  }

  private void createRelation(
      UUID workspace, UUID relationType, UUID source, UUID target, String key) {
    assertOk(
        postCommand(
            workspace,
            "CreateRelation",
            key,
            Map.of(
                "relationTypeId",
                relationType,
                "sourceId",
                source,
                "targetId",
                target,
                "relationFields",
                Map.of(),
                "source",
                Map.of("type", "manual"))));
  }

  private MetaIds insertBlockToBusMeta(UUID workspace) {
    var block = insertObjectType(workspace, "sysml_block", "SysML Block");
    var node = insertObjectType(workspace, "bus_node", "Bus Node");
    insertField(block, "name", "string", true);
    insertField(block, "bandwidth", "number", true);
    insertField(node, "name", "string", true);
    insertField(node, "capacity", "number", true);
    var connector = insertRelationType(workspace, "connector", block, block);
    var link = insertRelationType(workspace, "bus_link", node, node);
    var realizes = insertRelationType(workspace, "realizes", block, node);
    return new MetaIds(block, node, connector, link, realizes);
  }

  private void insertWorkspace(UUID workspace) {
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, ?, 'ACTIVE')",
        workspace,
        "M2M workspace");
  }

  private UUID insertObjectType(UUID workspace, String code, String name) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, code, name, published, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, TRUE, 'test', 'test', now(), now())
        """,
        id,
        workspace,
        code,
        name);
    return id;
  }

  private void insertField(UUID objectType, String code, String dataType, boolean required) {
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, code, name, required, data_type, constraints,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '{}'::jsonb, 'test', 'test', now(), now())
        """,
        UUID.randomUUID(),
        objectType,
        code,
        code,
        required,
        dataType);
  }

  private UUID insertRelationType(UUID workspace, String code, UUID source, UUID target) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO relation_type
          (id, workspace_id, code, source_type, target_type, direction, cardinality,
           semantics, hierarchical, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'directed', 'many_to_many', 'weak', FALSE,
          'test', 'test', now(), now())
        """,
        id,
        workspace,
        code,
        source,
        target);
    return id;
  }

  private UUID insertReadObject(UUID workspace, String type, Map<String, Object> fields) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, ?, 'ACTIVE', 1, CAST(? AS jsonb), now())
        """,
        workspace,
        id,
        type,
        json(fields));
    return id;
  }

  private void insertReadRelation(
      UUID workspace, UUID relationId, String type, UUID source, UUID target) {
    jdbc.update(
        """
        INSERT INTO rm_relation
          (workspace_id, relation_id, relation_type_code, source_id, target_id, fields,
           hierarchical, status, version, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}'::jsonb, FALSE, 'ACTIVE', 1, now())
        """,
        workspace,
        relationId,
        type,
        source,
        target);
  }

  private void projectOutbox() throws Exception {
    var events =
        jdbc.queryForList(
            """
            SELECT payload::text FROM event_outbox
            ORDER BY CASE event_type
                WHEN 'ObjectCreated' THEN 1
                WHEN 'FieldChanged' THEN 2
                WHEN 'RelationCreated' THEN 3
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

  private ResponseEntity<Map> postMeta(
      UUID workspace, String commandType, String key, Map<String, Object> payload) {
    return post(workspace, "/meta-commands", commandType, key, payload);
  }

  private ResponseEntity<Map> postCommand(
      UUID workspace, String commandType, String key, Map<String, Object> payload) {
    return post(workspace, "/commands", commandType, key, payload);
  }

  private ResponseEntity<Map> post(
      UUID workspace, String path, String commandType, String key, Map<String, Object> payload) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "m2m-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(
            Map.of(
                "commandType",
                commandType,
                "workspaceId",
                workspace.toString(),
                "correlationId",
                UUID.nameUUIDFromBytes((commandType + ":" + key).getBytes(StandardCharsets.UTF_8))
                    .toString(),
                "idempotencyKey",
                key,
                "payload",
                payload),
            headers),
        Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private void assertError(String code, ResponseEntity<Map> response) {
    assertEquals(code, ((Map<?, ?>) response.getBody().get("error")).get("code"));
  }

  @SuppressWarnings("unchecked")
  private UUID createdObjectId(Map body) {
    for (var eventId : (List<String>) body.get("events")) {
      var objectId =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (objectId != null) return UUID.fromString(objectId);
    }
    throw new IllegalStateException("CreateObject 未产生 ObjectCreated 事件");
  }

  private int countObjects(UUID workspace, UUID objectType) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM data_object WHERE workspace_id = ? AND object_type_id = ?",
        Integer.class,
        workspace,
        objectType);
  }

  private int countRelations(UUID workspace, UUID relationType) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM data_relation WHERE workspace_id = ? AND relation_type_id = ?",
        Integer.class,
        workspace,
        relationType);
  }

  private int provenanceCount(UUID workspace) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM m2m_provenance WHERE workspace_id = ?", Integer.class, workspace);
  }

  private String targetValue(UUID workspace, UUID type, String name, String field) {
    return jdbc.queryForObject(
        """
        SELECT value.value #>> '{}'
        FROM data_object object
        JOIN data_field_value name_value ON name_value.object_id = object.id
        JOIN field_def name_field ON name_field.id = name_value.field_def_id
        JOIN data_field_value value ON value.object_id = object.id
        JOIN field_def value_field ON value_field.id = value.field_def_id
        WHERE object.workspace_id = ? AND object.object_type_id = ?
          AND name_field.code = 'name' AND name_value.value #>> '{}' = ?
          AND value_field.code = ?
        """,
        String.class,
        workspace,
        type,
        name,
        field);
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalArgumentException("JSON 序列化失败", failure);
    }
  }

  private record MetaIds(
      UUID blockType, UUID nodeType, UUID connectorType, UUID linkType, UUID correspondenceType) {
    boolean isEmpty() {
      return false;
    }
  }
}
