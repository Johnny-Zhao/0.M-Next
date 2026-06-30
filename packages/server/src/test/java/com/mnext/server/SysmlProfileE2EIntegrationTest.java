package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
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
class SysmlProfileE2EIntegrationTest {
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
  @LocalServerPort int port;

  @Test
  void sysmlProfileImportsXmiAndEnforcesRules() throws Exception {
    var template = template("sysml_profile");
    var version = templateVersion(template);
    defineProfile(version);
    assertOk(meta(AUTHOR, publishTemplate(version, "publish-sysml-profile")));
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-sysml-profile")));

    var imported =
        post(
            workspace,
            "/exchange/sysml-xmi/apply",
            Map.of("payload", sampleXmi(), "confirmRemovals", false));
    assertEquals(200, imported.getStatusCode().value(), String.valueOf(imported.getBody()));
    assertTrue(list(imported.getBody(), "unapplied").isEmpty(), String.valueOf(imported.getBody()));
    assertEquals(3, list(imported.getBody(), "applied").size());
    assertXmiIdentityBaseline(workspace, sampleXmi(), 1);
    projectOutbox();

    assertImportedObjectsAndAssociation(workspace);
    assertObjectTypesViewExposesInheritedName(workspace);
    var refreshed = sampleXmi().replace("Engine shall be safe", "Engine shall remain safe");
    var reimported =
        post(
            workspace,
            "/exchange/sysml-xmi/apply",
            Map.of("payload", refreshed, "confirmRemovals", false));
    assertEquals(200, reimported.getStatusCode().value(), String.valueOf(reimported.getBody()));
    assertTrue(
        list(reimported.getBody(), "unapplied").isEmpty(), String.valueOf(reimported.getBody()));
    assertXmiIdentityBaseline(workspace, refreshed, 2);

    var rejected =
        post(
            workspace,
            "/commands",
            createObject(
                workspace,
                objectType(workspace, "sysml_requirement"),
                "create-empty-requirement",
                Map.of("name", "Incomplete", "req_id", "REQ-BAD", "text", "")));
    assertEquals(422, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("RULE-422-RULE-VIOLATION", errorCode(rejected));
  }

  private void defineProfile(UUID version) {
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineValueType",
                AUTHOR,
                "define-sysml-id",
                Map.of(
                    "templateVersionId", version,
                    "code", "sysml_id",
                    "name", "SysML ID",
                    "basePrimitive", "text",
                    "parentValueTypeCode", "text"))));
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineObjectType",
                AUTHOR,
                "define-uml-class",
                Map.of(
                    "templateVersionId", version,
                    "code", "uml_class",
                    "name", "UML Class"))));
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineObjectType",
                AUTHOR,
                "define-sysml-block",
                Map.of(
                    "templateVersionId", version,
                    "code", "sysml_block",
                    "name", "SysML Block",
                    "parentTypeCode", "uml_class"))));
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineObjectType",
                AUTHOR,
                "define-sysml-requirement",
                Map.of(
                    "templateVersionId", version,
                    "code", "sysml_requirement",
                    "name", "SysML Requirement",
                    "parentTypeCode", "uml_class"))));
    var umlClass = objectType(AUTHOR, "uml_class");
    var requirement = objectType(AUTHOR, "sysml_requirement");
    defineField(umlClass, "name", "Name", "string", null, true, "define-uml-name");
    defineField(requirement, "req_id", "Requirement ID", null, "sysml_id", false, "define-req-id");
    defineField(requirement, "text", "Text", "text", null, true, "define-req-text");
    assertOk(
        meta(
            AUTHOR,
            command(
                "DefineRelationType",
                AUTHOR,
                "define-uml-association",
                Map.of(
                    "code", "uml_association",
                    "name", "UML Association",
                    "sourceTypeId", umlClass,
                    "targetTypeId", umlClass,
                    "direction", "directed",
                    "cardinality", "many_to_many",
                    "semantics", "weak",
                    "hierarchical", false))));
    attachRelationTypeToTemplateVersion(AUTHOR, version, "uml_association");
    defineRequirementRule(version);
  }

  private void attachRelationTypeToTemplateVersion(UUID workspace, UUID version, String code) {
    jdbc.update(
        """
        UPDATE relation_type
        SET template_version_id = ?
        WHERE workspace_id = ? AND code = ?
        """,
        version,
        workspace,
        code);
  }

  private void defineField(
      UUID objectType,
      String code,
      String name,
      String dataType,
      String valueTypeCode,
      boolean required,
      String key) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeId", objectType);
    payload.put("code", code);
    payload.put("name", name);
    if (dataType != null) payload.put("dataType", dataType);
    if (valueTypeCode != null) payload.put("valueTypeCode", valueTypeCode);
    payload.put("required", required);
    assertOk(meta(AUTHOR, command("DefineFieldDef", AUTHOR, key, payload)));
  }

  private void defineRequirementRule(UUID version) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateVersionId", version);
    payload.put("ruleCode", "requirement_text_required");
    payload.put("scope", Map.of("objectTypeCode", "sysml_requirement", "fieldCode", "text"));
    payload.put("severity", "BLOCK");
    payload.put("when", "isBlank(field('text'))");
    payload.put("message", "Requirement text is required");
    payload.put("lightweight", true);
    assertOk(rule(AUTHOR, command("DefineRule", AUTHOR, "define-requirement-text-rule", payload)));
    assertOk(
        rule(
            AUTHOR,
            command(
                "PublishRule",
                AUTHOR,
                "publish-requirement-text-rule",
                Map.of("ruleCode", "requirement_text_required"))));
  }

  private void assertImportedObjectsAndAssociation(UUID workspace) {
    assertEquals(
        1,
        count(
            "data_object object JOIN object_type type ON type.id = object.object_type_id WHERE object.workspace_id = '"
                + workspace
                + "' AND type.code = 'sysml_block'"));
    assertEquals(
        1,
        count(
            "data_object object JOIN object_type type ON type.id = object.object_type_id WHERE object.workspace_id = '"
                + workspace
                + "' AND type.code = 'sysml_requirement'"));
    assertEquals(
        "REQ-1",
        value(
            """
            SELECT value.value #>> '{}'
            FROM data_field_value value
            JOIN field_def field ON field.id = value.field_def_id
            JOIN data_object object ON object.id = value.object_id
            WHERE object.workspace_id = ? AND field.code = 'req_id'
            """,
            workspace));
    assertEquals(
        "Engine shall be safe",
        value(
            """
            SELECT value.value #>> '{}'
            FROM data_field_value value
            JOIN field_def field ON field.id = value.field_def_id
            JOIN data_object object ON object.id = value.object_id
            WHERE object.workspace_id = ? AND field.code = 'text'
            """,
            workspace));
    assertEquals(
        1,
        count(
            """
            data_relation relation
            JOIN relation_type relation_type ON relation_type.id = relation.relation_type_id
            JOIN data_object source ON source.id = relation.source_id
            JOIN object_type source_type ON source_type.id = source.object_type_id
            JOIN data_object target ON target.id = relation.target_id
            JOIN object_type target_type ON target_type.id = target.object_type_id
            WHERE relation.workspace_id = '%s'
              AND relation_type.code = 'uml_association'
              AND source_type.code = 'sysml_block'
              AND target_type.code = 'sysml_requirement'
            """
                .formatted(workspace)));
  }

  private void assertObjectTypesViewExposesInheritedName(UUID workspace) {
    var types = get(workspace, "/views/object-types");
    var block = fields(types, "sysml_block");
    var requirement = fields(types, "sysml_requirement");
    assertTrue(block.containsKey("name"));
    assertTrue(requirement.containsKey("name"));
    assertTrue(requirement.containsKey("req_id"));
    assertTrue(requirement.containsKey("text"));
  }

  private void assertXmiIdentityBaseline(UUID workspace, String content, int version) {
    assertEquals(
        3,
        count(
            """
            xmi_identity
            WHERE workspace_id = '%s'
              AND project_ref = 'default'
              AND xmi_id IN ('A1', 'B1', 'R1')
            """
                .formatted(workspace)));
    assertEquals(
        3,
        count(
            """
            (SELECT DISTINCT xmi_id FROM xmi_identity
             WHERE workspace_id = '%s' AND project_ref = 'default') identities
            """
                .formatted(workspace)));
    assertEquals(
        version,
        value(
            """
            SELECT version FROM xmi_baseline_document
            WHERE workspace_id = ? AND project_ref = 'default'
            """,
            workspace));
    assertEquals(
        content,
        value(
            """
            SELECT content FROM xmi_baseline_document
            WHERE workspace_id = ? AND project_ref = 'default'
            """,
            workspace));
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
            "SysML Project"));
  }

  private Map<String, Object> createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    return command(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
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

  private Map<String, Object> get(UUID workspace, String path) {
    return Map.of("items", http.getForEntity(base(workspace) + path, List.class).getBody());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Map<?, ?>> fields(Map<String, Object> response, String typeCode) {
    var types = (List<Map<String, Object>>) response.get("items");
    var type =
        types.stream()
            .filter(value -> typeCode.equals(value.get("code")))
            .findFirst()
            .orElseThrow();
    var fields = new LinkedHashMap<String, Map<?, ?>>();
    for (var field : (List<Map<?, ?>>) type.get("fields")) {
      fields.put((String) field.get("code"), field);
    }
    return fields;
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> rule(UUID workspace, Object request) {
    return post(workspace, "/rule-commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", "sysml-profile-user");
    return http.postForEntity(
        base(workspace) + path, new HttpEntity<>(request, headers), Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private UUID objectType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private int count(String tableAndWhere) {
    return jdbc.queryForObject("SELECT count(*) FROM " + tableAndWhere, Integer.class);
  }

  private Object value(String sql, Object... args) {
    return jdbc.queryForObject(sql, Object.class, args);
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }

  private List<?> list(Map<?, ?> response, String key) {
    return (List<?>) response.get(key);
  }

  private String sampleXmi() throws Exception {
    return new ClassPathResource("sysml-profile-sample.xmi")
        .getContentAsString(StandardCharsets.UTF_8);
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
