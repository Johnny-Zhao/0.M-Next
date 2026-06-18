package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
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
class BusProfileE2EIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");

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
  @Autowired DerivedEvaluator derivedEvaluator;
  @LocalServerPort int port;

  @Test
  void busProfileComputesDerivedLoadAndColdPathBandwidthRule() throws Exception {
    var template = template("bus_profile");
    var version = templateVersion(template);
    defineProfile(version);
    assertOk(meta(AUTHOR, publishTemplate(version, "publish-bus-profile")));
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-bus-profile")));
    assertDerivedFieldsCopied(workspace);

    var linkType = objectType(workspace, "bus_link");
    var messageType = objectType(workspace, "message");
    var carries = relationType(workspace, "carries");
    assertOk(
        command(
            workspace, createObject(workspace, linkType, "create-link", Map.of("capacity", 100))));
    var link = objectByField(workspace, "bus_link", "capacity", "100");
    var message40 = createMessage(workspace, messageType, 40, "message-40");
    var message50 = createMessage(workspace, messageType, 50, "message-50");
    assertOk(command(workspace, createRelation(workspace, carries, link, message40, "carry-40")));
    assertOk(command(workspace, createRelation(workspace, carries, link, message50, "carry-50")));
    projectOutbox();

    assertDecimal("90", derivedEvaluator.evaluate(workspace, link, "total_load"));
    assertDecimal("10", derivedEvaluator.evaluate(workspace, link, "margin"));
    var firstRun = runId(rule(workspace, runRuleCheck(workspace, "run-bus-ok")));
    assertEquals(0, countResults(workspace, firstRun, "bandwidth_exceeded"));

    var message30 = createMessage(workspace, messageType, 30, "message-30");
    assertOk(command(workspace, createRelation(workspace, carries, link, message30, "carry-30")));
    projectOutbox();

    var exceededRun = runId(rule(workspace, runRuleCheck(workspace, "run-bus-exceeded")));

    assertEquals(1, countResults(workspace, exceededRun, "bandwidth_exceeded"));
    assertEquals(link, resultObject(workspace, exceededRun, "bandwidth_exceeded"));
    var message = resultMessage(workspace, exceededRun, "bandwidth_exceeded");
    assertTrue(message.contains("120"), message);
    assertTrue(message.contains("100"), message);
    assertDecimal("120", derivedEvaluator.evaluate(workspace, link, "total_load"));
    assertDecimal("-20", derivedEvaluator.evaluate(workspace, link, "margin"));
  }

  private void defineProfile(UUID version) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineObjectType",
                AUTHOR,
                "define-bus-link",
                Map.of("templateVersionId", version, "code", "bus_link", "name", "Bus Link"))));
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineObjectType",
                AUTHOR,
                "define-message",
                Map.of("templateVersionId", version, "code", "message", "name", "Message"))));
    var busLink = objectType(AUTHOR, "bus_link");
    var message = objectType(AUTHOR, "message");
    defineField(busLink, "capacity", "Capacity", "number", true, "define-link-capacity");
    defineField(message, "load", "Load", "number", true, "define-message-load");
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineRelationType",
                AUTHOR,
                "define-carries",
                Map.of(
                    "code",
                    "carries",
                    "name",
                    "Carries",
                    "sourceTypeId",
                    busLink,
                    "targetTypeId",
                    message,
                    "direction",
                    "directed",
                    "cardinality",
                    "one_to_many",
                    "semantics",
                    "weak",
                    "hierarchical",
                    false))));
    attachRelationTypeToTemplateVersion(version, "carries");
    defineDerived(
        version,
        busLink,
        "total_load",
        "Total Load",
        "sum(traverse('carries','out'),'load')",
        "define-total-load");
    defineDerived(
        version,
        busLink,
        "margin",
        "Margin",
        "field('capacity') - field('total_load')",
        "define-margin");
    defineBandwidthRule(version);
  }

  private void defineField(
      UUID objectType, String code, String name, String dataType, boolean required, String key) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineFieldDef",
                AUTHOR,
                key,
                Map.of(
                    "objectTypeId",
                    objectType,
                    "code",
                    code,
                    "name",
                    name,
                    "dataType",
                    dataType,
                    "required",
                    required))));
  }

  private void defineDerived(
      UUID version, UUID objectType, String code, String name, String derivation, String key) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineDerivedField",
                AUTHOR,
                key,
                Map.of(
                    "templateVersionId",
                    version,
                    "objectTypeId",
                    objectType,
                    "code",
                    code,
                    "name",
                    name,
                    "resultType",
                    "number",
                    "derivation",
                    derivation))));
  }

  private void defineBandwidthRule(UUID version) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", version);
    payload.put("ruleCode", "bandwidth_exceeded");
    payload.put("scope", Map.of("objectTypeCode", "bus_link"));
    payload.put("severity", "BLOCK");
    payload.put("when", "field('total_load') > field('capacity')");
    payload.put("message", "链路负载 ${field('total_load')} 超带宽 ${field('capacity')}");
    payload.put("lightweight", false);
    assertOk(rule(AUTHOR, command("DefineRule", AUTHOR, "define-bandwidth-rule", payload)));
    assertOk(
        rule(
            AUTHOR,
            command(
                "PublishRule",
                AUTHOR,
                "publish-bandwidth-rule",
                Map.of("ruleCode", "bandwidth_exceeded"))));
  }

  private void attachRelationTypeToTemplateVersion(UUID version, String code) {
    jdbc.update(
        """
        UPDATE relation_type
        SET template_version_id = ?
        WHERE workspace_id = ? AND code = ?
        """,
        version,
        AUTHOR,
        code);
  }

  private UUID createMessage(UUID workspace, UUID messageType, int load, String key) {
    assertOk(
        command(
            workspace,
            createObject(workspace, messageType, "create-" + key, Map.of("load", load))));
    return objectByField(workspace, "message", "load", String.valueOf(load));
  }

  private Map<String, Object> createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    return command(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
  }

  private Map<String, Object> createRelation(
      UUID workspace, UUID relationType, UUID source, UUID target, String key) {
    return command(
        "CreateRelation",
        workspace,
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
            Map.of("type", "manual")));
  }

  private Map<String, Object> runRuleCheck(UUID workspace, String key) {
    return command(
        "RunRuleCheck", workspace, key, Map.of("scope", Map.of("objectTypeCode", "bus_link")));
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

  private UUID templateVersion(UUID template) {
    var version = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template_version (id, template_id, version, status)
        VALUES (?, ?, 1, 'draft')
        """,
        version,
        template);
    return version;
  }

  private Map<String, Object> publishTemplate(UUID version, String key) {
    return command("PublishTemplateVersion", AUTHOR, key, Map.of("templateVersionId", version));
  }

  private Map<String, Object> instantiate(UUID template, UUID workspace, String key) {
    return command(
        "InstantiateWorkspace",
        AUTHOR,
        key,
        Map.of(
            "templateId",
            template,
            "version",
            1,
            "newWorkspaceId",
            workspace,
            "workspaceName",
            "Bus Project"));
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

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> rule(UUID workspace, Object request) {
    return post(workspace, "/rule-commands", request);
  }

  private ResponseEntity<Map> command(UUID workspace, Object request) {
    return post(workspace, "/commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "bus-profile-user");
    return http.postForEntity(
        base(workspace) + path, new HttpEntity<>(request, headers), Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private String runId(ResponseEntity<Map> response) {
    assertOk(response);
    return (String) ((List<?>) response.getBody().get("events")).getFirst();
  }

  private void assertDerivedFieldsCopied(UUID workspace) {
    assertEquals(
        2,
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM derived_field derived
            JOIN object_type type ON type.id = derived.object_type_id
            WHERE derived.workspace_id = ?
              AND type.workspace_id = ?
              AND type.code = 'bus_link'
              AND derived.code IN ('total_load', 'margin')
              AND derived.template_version_id IS NULL
            """,
            Integer.class,
            workspace,
            workspace));
  }

  private UUID objectType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private UUID relationType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private UUID objectByField(UUID workspace, String typeCode, String fieldCode, String value) {
    return jdbc.queryForObject(
        """
        SELECT object.id
        FROM data_object object
        JOIN object_type type ON type.id = object.object_type_id
        JOIN data_field_value field_value ON field_value.object_id = object.id
        JOIN field_def field ON field.id = field_value.field_def_id
        WHERE object.workspace_id = ?
          AND type.code = ?
          AND field.code = ?
          AND field_value.value #>> '{}' = ?
        ORDER BY object.created_at DESC
        LIMIT 1
        """,
        UUID.class,
        workspace,
        typeCode,
        fieldCode,
        value);
  }

  private int countResults(UUID workspace, String runId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM check_result
        WHERE workspace_id = ? AND run_id = ?::uuid AND rule_code = ?
        """,
        Integer.class,
        workspace,
        runId,
        ruleCode);
  }

  private UUID resultObject(UUID workspace, String runId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT object_id
        FROM check_result
        WHERE workspace_id = ? AND run_id = ?::uuid AND rule_code = ?
        """,
        UUID.class,
        workspace,
        runId,
        ruleCode);
  }

  private String resultMessage(UUID workspace, String runId, String ruleCode) {
    return jdbc.queryForObject(
        """
        SELECT message
        FROM check_result
        WHERE workspace_id = ? AND run_id = ?::uuid AND rule_code = ?
        """,
        String.class,
        workspace,
        runId,
        ruleCode);
  }

  private void assertDecimal(String expected, Object actual) {
    assertTrue(actual instanceof BigDecimal, "expected BigDecimal but got " + actual);
    assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) actual));
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

  private String base(UUID workspace) {
    return "http://localhost:" + port + "/workspaces/" + workspace;
  }
}
