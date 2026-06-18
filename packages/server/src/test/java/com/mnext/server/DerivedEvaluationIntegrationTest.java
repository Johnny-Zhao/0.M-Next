package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
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
class DerivedEvaluationIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID LINK_TYPE = UUID.fromString("dddddddd-1111-4111-8111-111111111111");
  private static final UUID MESSAGE_TYPE = UUID.fromString("dddddddd-2222-4222-8222-222222222222");
  private static final UUID NODE_TYPE = UUID.fromString("dddddddd-3333-4333-8333-333333333333");
  private static final UUID LINK = UUID.fromString("eeeeeeee-1111-4111-8111-111111111111");
  private static final UUID MESSAGE_A = UUID.fromString("eeeeeeee-2222-4222-8222-222222222222");
  private static final UUID MESSAGE_B = UUID.fromString("eeeeeeee-3333-4333-8333-333333333333");
  private static final UUID CHILD = UUID.fromString("eeeeeeee-4444-4444-8444-444444444444");
  private static final UUID LEAF = UUID.fromString("eeeeeeee-5555-4555-8555-555555555555");

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
  @Autowired DerivedEvaluator derivedEvaluator;
  @Autowired TestRestTemplate http;
  @LocalServerPort int port;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM check_result");
    jdbc.update("DELETE FROM rm_relation");
    jdbc.update("DELETE FROM rm_object");
    jdbc.update("DELETE FROM event_outbox");
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_relation");
    jdbc.update("DELETE FROM data_object");
    jdbc.update("DELETE FROM derived_field");
    jdbc.update("DELETE FROM rule_def");
    jdbc.update("DELETE FROM command_log");
    jdbc.update(
        "DELETE FROM relation_type WHERE workspace_id = ? AND code LIKE 'der_%'", WORKSPACE);
    jdbc.update(
        "DELETE FROM field_def WHERE object_type_id IN (?, ?, ?)",
        LINK_TYPE,
        MESSAGE_TYPE,
        NODE_TYPE);
    jdbc.update(
        "DELETE FROM object_type WHERE id IN (?, ?, ?)", LINK_TYPE, MESSAGE_TYPE, NODE_TYPE);
  }

  @Test
  void evaluatesSingleNestedAndMultiHopDerivedFieldsFromReadModel() {
    setupRuntimeModel();
    insertDerived(LINK_TYPE, "total_load", "number", "sum(traverse('der_carries','out'),'load')");
    insertDerived(
        LINK_TYPE, "remaining_capacity", "number", "field('capacity') - field('total_load')");
    insertDerived(
        LINK_TYPE, "tree_mass", "number", "sum(traverseDeep('der_contains','out',3),'mass')");
    insertReadModelGraph(20);

    assertDecimal("16", derivedEvaluator.evaluate(WORKSPACE, LINK, "total_load"));
    assertDecimal("4", derivedEvaluator.evaluate(WORKSPACE, LINK, "remaining_capacity"));
    assertDecimal("8", derivedEvaluator.evaluate(WORKSPACE, LINK, "tree_mass"));
  }

  @Test
  void rulesCanReferenceDerivedFieldsInHotAndColdPaths() {
    setupRuntimeModel();
    insertDerived(LINK_TYPE, "total_load", "number", "sum(traverse('der_carries','out'),'load')");
    insertRule(
        "derived-capacity", LINK_TYPE, null, "field('total_load') > field('capacity')", true);
    insertDataObject(LINK, LINK_TYPE, Map.of("capacity", 20, "name", "link"));
    insertReadModelGraph(20);

    var response = postCommand(updateCapacity(10, "update-capacity-blocked"));

    assertEquals(422, response.getStatusCode().value(), String.valueOf(response.getBody()));
    assertEquals("RULE-422-RULE-VIOLATION", errorCode(response));
    assertEquals("20", storedJson(LINK, "capacity"));
    assertEquals(0, count("event_outbox"));
    assertEquals(0, count("command_log WHERE command_type = 'UpdateFields'"));

    jdbc.update(
        """
        UPDATE rm_object
        SET fields = jsonb_set(fields, '{capacity}', '10'::jsonb)
        WHERE workspace_id = ? AND object_id = ?
        """,
        WORKSPACE,
        LINK);
    insertRule(
        "derived-capacity-cold", LINK_TYPE, null, "field('total_load') > field('capacity')", false);
    var run = postRule(runRuleCheck("run-derived-cold"));
    var runId = (String) ((List<?>) run.getBody().get("events")).getFirst();

    assertEquals(200, run.getStatusCode().value(), String.valueOf(run.getBody()));
    assertEquals(2, count("check_result WHERE run_id = '" + runId + "'"));
  }

  @Test
  void instantiateCopiesTemplateDerivedFieldsToTargetWorkspaceScopes() {
    var template = template("derived_copy_tpl");
    var version = templateVersion(template, 1, "draft");
    var type = templateObject(WORKSPACE, version, "derived_copy_link", "Derived Copy Link");
    templateDerived(version, type, "total_load", "sum(traverse('der_carries','out'),'load')");
    assertEquals(
        200, meta(WORKSPACE, publish(version, "publish-derived-copy")).getStatusCode().value());
    var target = UUID.randomUUID();

    assertEquals(
        200,
        meta(WORKSPACE, instantiate(template, target, "instantiate-derived-copy"))
            .getStatusCode()
            .value());

    assertEquals(1, countDerived(target, "total_load"));
    assertEquals(0, countDerivedScopeOutsideWorkspace(target, "total_load"));
    assertEquals(
        null,
        value(
            "SELECT template_version_id FROM derived_field WHERE workspace_id = '" + target + "'"));
  }

  private void setupRuntimeModel() {
    insertObjectType(LINK_TYPE, "der_link", "Derived Link");
    insertObjectType(MESSAGE_TYPE, "der_message", "Derived Message");
    insertObjectType(NODE_TYPE, "der_node", "Derived Node");
    insertField(LINK_TYPE, "name", "string", true);
    insertField(LINK_TYPE, "capacity", "number", false);
    insertField(MESSAGE_TYPE, "load", "number", false);
    insertField(NODE_TYPE, "mass", "number", false);
  }

  private void insertObjectType(UUID id, String code, String name) {
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, code, name, published, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, TRUE, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        id,
        WORKSPACE,
        code,
        name);
  }

  private UUID insertField(UUID objectType, String code, String dataType, boolean required) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO field_def
          (id, object_type_id, code, name, required, data_type, constraints,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '{}'::jsonb, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        id,
        objectType,
        code,
        code,
        required,
        dataType);
    return id;
  }

  private void insertDerived(UUID objectType, String code, String resultType, String derivation) {
    jdbc.update(
        """
        INSERT INTO derived_field
          (id, workspace_id, object_type_id, code, name, result_type, derivation,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        UUID.randomUUID(),
        WORKSPACE,
        objectType,
        code,
        code,
        resultType,
        derivation);
  }

  private void insertRule(
      String code, UUID objectType, String fieldCode, String when, boolean lightweight) {
    var fieldId =
        fieldCode == null
            ? null
            : jdbc.queryForObject(
                "SELECT id FROM field_def WHERE object_type_id = ? AND code = ?",
                UUID.class,
                objectType,
                fieldCode);
    jdbc.update(
        """
        INSERT INTO rule_def
          (id, workspace_id, rule_code, scope_object_type_id, scope_field_def_id, severity,
           when_src, message, lightweight, published, version, created_by, updated_by,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'BLOCK', ?, 'over capacity ${field(''total_load'')}',
          ?, TRUE, 2, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        UUID.randomUUID(),
        WORKSPACE,
        code,
        objectType,
        fieldId,
        when,
        lightweight);
  }

  private void insertDataObject(UUID objectId, UUID objectType, Map<String, Object> fields) {
    jdbc.update(
        """
        INSERT INTO data_object
          (id, workspace_id, object_type_id, status, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, 'DRAFT', 1, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        objectId,
        WORKSPACE,
        objectType);
    for (var entry : fields.entrySet()) {
      var fieldId =
          jdbc.queryForObject(
              "SELECT id FROM field_def WHERE object_type_id = ? AND code = ?",
              UUID.class,
              objectType,
              entry.getKey());
      jdbc.update(
          """
          INSERT INTO data_field_value
            (object_id, field_def_id, value, version, created_by, updated_by, created_at, updated_at)
          VALUES (?, ?, CAST(? AS jsonb), 1, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          """,
          objectId,
          fieldId,
          json(entry.getValue()));
    }
  }

  private void insertReadModelGraph(int capacity) {
    rmObject(LINK, "der_link", "{\"name\":\"link\",\"capacity\":" + capacity + "}");
    rmObject(MESSAGE_A, "der_message", "{\"load\":7}");
    rmObject(MESSAGE_B, "der_message", "{\"load\":9}");
    rmObject(CHILD, "der_node", "{\"mass\":3}");
    rmObject(LEAF, "der_node", "{\"mass\":5}");
    rmRelation("der_carries", LINK, MESSAGE_A);
    rmRelation("der_carries", LINK, MESSAGE_B);
    rmRelation("der_contains", LINK, CHILD);
    rmRelation("der_contains", CHILD, LEAF);
  }

  private void rmObject(UUID objectId, String typeCode, String fieldsJson) {
    jdbc.update(
        """
        INSERT INTO rm_object
          (workspace_id, object_id, object_type_code, status, version, fields, updated_at)
        VALUES (?, ?, ?, 'DRAFT', 1, CAST(? AS jsonb), CURRENT_TIMESTAMP)
        """,
        WORKSPACE,
        objectId,
        typeCode,
        fieldsJson);
  }

  private void rmRelation(String relationType, UUID source, UUID target) {
    jdbc.update(
        """
        INSERT INTO rm_relation
          (workspace_id, relation_id, relation_type_code, source_id, target_id,
           fields, hierarchical, status, version, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}'::jsonb, FALSE, 'ACTIVE', 1, CURRENT_TIMESTAMP)
        """,
        WORKSPACE,
        UUID.randomUUID(),
        relationType,
        source,
        target);
  }

  private Map<String, Object> updateCapacity(int value, String key) {
    var field = new LinkedHashMap<String, Object>();
    field.put("fieldDefCode", "capacity");
    field.put("value", value);
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectId", LINK);
    payload.put("expectedObjectVersion", 1);
    payload.put("fields", List.of(field));
    return command("UpdateFields", WORKSPACE, key, payload);
  }

  private Map<String, Object> runRuleCheck(String key) {
    return command(
        "RunRuleCheck", WORKSPACE, key, Map.of("scope", Map.of("objectTypeCode", "der_link")));
  }

  private UUID template(String code) {
    var template = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, ?, ?, 'test', CURRENT_TIMESTAMP)
        """,
        template,
        code + "_" + template.toString().substring(0, 8),
        code);
    return template;
  }

  private UUID templateVersion(UUID template, int version, String status) {
    var id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO scene_template_version (id, template_id, version, status) VALUES (?, ?, ?, ?)",
        id,
        template,
        version,
        status);
    return id;
  }

  private UUID templateObject(UUID workspace, UUID version, String code, String name) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, FALSE, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        id,
        workspace,
        version,
        code,
        name);
    return id;
  }

  private void templateDerived(UUID version, UUID objectType, String code, String derivation) {
    jdbc.update(
        """
        INSERT INTO derived_field
          (id, workspace_id, object_type_id, template_version_id, code, name, result_type,
           derivation, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'number', ?, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        UUID.randomUUID(),
        WORKSPACE,
        objectType,
        version,
        code,
        code,
        derivation);
  }

  private Map<String, Object> publish(UUID version, String key) {
    return command("PublishTemplateVersion", WORKSPACE, key, Map.of("templateVersionId", version));
  }

  private Map<String, Object> instantiate(UUID template, UUID newWorkspace, String key) {
    return command(
        "InstantiateWorkspace",
        WORKSPACE,
        key,
        Map.of(
            "templateId",
            template,
            "version",
            1,
            "newWorkspaceId",
            newWorkspace,
            "workspaceName",
            "derived target"));
  }

  private Map<String, Object> command(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("commandType", type);
    request.put("payload", payload);
    return request;
  }

  private ResponseEntity<Map> postCommand(Object request) {
    return post(WORKSPACE, "/commands", request);
  }

  private ResponseEntity<Map> postRule(Object request) {
    return post(WORKSPACE, "/rule-commands", request);
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "derived-eval-user");
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private void assertDecimal(String expected, Object actual) {
    assertTrue(actual instanceof BigDecimal, "expected BigDecimal but got " + actual);
    assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) actual));
  }

  private String json(Object value) {
    return value instanceof Number ? String.valueOf(value) : "\"" + value + "\"";
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private Object value(String sql) {
    return jdbc.queryForObject(sql, Object.class);
  }

  private int countDerived(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM derived_field WHERE workspace_id = ? AND code = ?",
        Integer.class,
        workspace,
        code);
  }

  private int countDerivedScopeOutsideWorkspace(UUID workspace, String code) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM derived_field derived
        JOIN object_type type ON type.id = derived.object_type_id
        WHERE derived.workspace_id = ? AND derived.code = ? AND type.workspace_id <> ?
        """,
        Integer.class,
        workspace,
        code,
        workspace);
  }

  private String storedJson(UUID objectId, String fieldCode) {
    return jdbc.queryForObject(
        """
        SELECT value::text
        FROM data_field_value value
        JOIN field_def field ON field.id = value.field_def_id
        WHERE value.object_id = ? AND field.code = ?
        """,
        String.class,
        objectId,
        fieldCode);
  }
}
