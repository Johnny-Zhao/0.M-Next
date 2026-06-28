package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.events.EventEnvelope;
import com.mnext.server.plugin.ProfileManifest;
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
class ProfileLoaderIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final String ACTOR = "profile-loader-user";

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

  @Autowired ProfileLoader loader;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestRestTemplate http;
  @Autowired DerivedEvaluator derivedEvaluator;
  @Autowired ReadModelProjection projection;
  @LocalServerPort int port;

  @Test
  void installUninstallRestoreAndIdempotencyFollowProfileLifecycle() throws Exception {
    var manifest = fixture();
    loader.install(manifest, Actor.user(ACTOR));
    assertEquals("published", templateStatus(manifest.templateCode()));
    assertTrue(templateCodes().contains(manifest.templateCode()));
    assertEquals(1, templateCount(manifest.templateCode()));

    loader.install(manifest, Actor.user(ACTOR));
    assertEquals(1, templateCount(manifest.templateCode()));
    assertEquals(1, templateVersionCount(manifest.templateCode()));

    var template = templateId(manifest.templateCode());
    var workspace = UUID.randomUUID();
    assertOk(meta(AUTHOR, instantiate(template, workspace, "instantiate-profile-loader")));
    assertEquals(1, copiedCount("derived_field", workspace));
    assertEquals(1, copiedCount("rule_def", workspace));

    var roomType = objectType(workspace, "room");
    var fixtureType = objectType(workspace, "fixture");
    var relationType = relationType(workspace, "contains_fixture");
    var room =
        createObject(
            workspace, roomType, "create-profile-room", Map.of("name", "lab", "base_score", 0));
    var fixture =
        createObject(
            workspace, fixtureType, "create-profile-fixture", Map.of("name", "lamp", "load", 7));
    applyEvents(command(workspace, createRelation(workspace, relationType, room, fixture)));
    assertDecimal("7", derivedEvaluator.evaluate(workspace, room, "fixture_load"));

    var runId = runId(rule(workspace, runRuleCheck(workspace, "room", "run-profile-rules")));
    assertEquals(1, countResults(workspace, runId, "base_score_floor"));
    assertEquals("WARN", ruleStatus(workspace, room));

    loader.uninstall(manifest.templateCode(), Actor.user(ACTOR));
    assertEquals("withdrawn", templateStatus(manifest.templateCode()));
    assertFalse(templateCodes().contains(manifest.templateCode()));
    var rejected = meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-withdrawn"));
    assertEquals(422, rejected.getStatusCode().value(), String.valueOf(rejected.getBody()));
    assertEquals("KERNEL-422-TEMPLATE-NOT-PUBLISHED", errorCode(rejected));

    createObject(workspace, fixtureType, "create-after-withdraw", Map.of("name", "fan", "load", 3));
    runId = runId(rule(workspace, runRuleCheck(workspace, "room", "run-after-withdraw")));
    assertEquals(1, countResults(workspace, runId, "base_score_floor"));

    loader.install(manifest, Actor.user(ACTOR));
    assertEquals("published", templateStatus(manifest.templateCode()));
    assertTrue(templateCodes().contains(manifest.templateCode()));
    assertOk(meta(AUTHOR, instantiate(template, UUID.randomUUID(), "instantiate-after-restore")));
  }

  @Test
  void badManifestFailsBeforeLeavingHalfInstalledTemplate() throws Exception {
    var manifest = badFixture();
    var failure =
        assertThrows(
            CommandRejectedException.class, () -> loader.install(manifest, Actor.user(ACTOR)));
    assertEquals("META-400-SCHEMA-INVALID", failure.error().code());
    assertEquals(0, templateCount(manifest.templateCode()));
  }

  @Test
  void applyProfileAddsSecondProfileToExistingWorkspace() throws Exception {
    var first = fixture();
    var second = profileVariant(first, "profile-loader-second", "profile_loader_second");
    loader.install(first, Actor.user(ACTOR));
    loader.install(second, Actor.user(ACTOR));

    var workspace = UUID.randomUUID();
    assertOk(
        meta(
            AUTHOR,
            instantiate(templateId(first.templateCode()), workspace, "instantiate-base-profile")));
    var secondTemplate = templateId(second.templateCode());
    assertOk(meta(workspace, applyProfile(workspace, secondTemplate, 1, "apply-second-profile")));
    assertOk(
        meta(workspace, applyProfile(workspace, secondTemplate, 1, "apply-second-profile-again")));

    var secondVersion = templateVersionId(second.templateCode(), 1);
    assertEquals(2, workspaceProfileCount(workspace));
    assertEquals(2, objectTypeCount(workspace, "room"));
    var firstRoomType = objectType(workspace, null, "room");
    var secondRoomType = objectType(workspace, secondVersion, "room");
    var firstRoom =
        createObject(
            workspace,
            firstRoomType,
            "create-first-profile-room",
            Map.of("name", "base", "base_score", 2));
    var secondRoom =
        createObject(
            workspace,
            secondRoomType,
            "create-second-profile-room",
            Map.of("name", "addon", "base_score", 3));

    assertObjectType(firstRoom, firstRoomType);
    assertObjectType(secondRoom, secondRoomType);
    var profiles = workspaceProfiles(workspace);
    assertEquals(2, profiles.size(), profiles.toString());
    assertTrue(
        profiles.stream()
            .anyMatch(profile -> first.templateCode().equals(profile.get("templateCode"))));
    assertTrue(
        profiles.stream()
            .anyMatch(profile -> second.templateCode().equals(profile.get("templateCode"))));
  }

  private ProfileManifest fixture() throws Exception {
    var resource = new ClassPathResource("profile-loader/minimal-profile.json");
    return mapper.readValue(resource.getInputStream(), ProfileManifest.class);
  }

  private ProfileManifest badFixture() throws Exception {
    var manifest = fixture();
    return new ProfileManifest(
        manifest.id() + "-bad",
        "Bad Profile",
        manifest.version(),
        manifest.templateCode() + "_bad",
        manifest.valueTypes(),
        manifest.objectTypes(),
        List.of(new ProfileManifest.Field("missing", "oops", "Oops", "string", null, true, null)),
        manifest.relations(),
        manifest.derived(),
        manifest.rules());
  }

  private ProfileManifest profileVariant(ProfileManifest manifest, String id, String templateCode) {
    return new ProfileManifest(
        id,
        "Profile Loader Second",
        manifest.version(),
        templateCode,
        manifest.valueTypes(),
        manifest.objectTypes(),
        manifest.fields(),
        manifest.relations(),
        manifest.derived(),
        manifest.rulesOrEmpty().stream()
            .map(
                rule ->
                    new ProfileManifest.Rule(
                        templateCode + "_" + rule.code(),
                        rule.objectType(),
                        rule.field(),
                        rule.severity(),
                        rule.when(),
                        rule.message(),
                        rule.impact(),
                        rule.suggest(),
                        rule.fix(),
                        rule.lightweight()))
            .toList());
  }

  private Map<String, Object> instantiate(UUID template, UUID newWorkspace, String key) {
    return metaCommand(
        "InstantiateWorkspace",
        AUTHOR,
        key,
        Map.of(
            "templateId",
            template,
            "version",
            1,
            "newWorkspaceId",
            newWorkspace,
            "workspaceName",
            "Profile Loader Project"));
  }

  private Map<String, Object> applyProfile(UUID workspace, UUID template, int version, String key) {
    return metaCommand(
        "ApplyProfile", workspace, key, Map.of("templateId", template, "version", version));
  }

  private Map<String, Object> createObjectCommand(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    return command(
        "CreateObject",
        workspace,
        key,
        Map.of("objectTypeId", objectType, "fields", fields, "source", Map.of("type", "manual")));
  }

  private Map<String, Object> createRelation(
      UUID workspace, UUID relationType, UUID source, UUID target) {
    return command(
        "CreateRelation",
        workspace,
        "relate-profile-fixture-" + target.toString().substring(0, 8),
        Map.of(
            "relationTypeId", relationType,
            "sourceId", source,
            "targetId", target,
            "relationFields", Map.of(),
            "source", Map.of("type", "manual")));
  }

  private Map<String, Object> runRuleCheck(UUID workspace, String objectTypeCode, String key) {
    return command(
        "RunRuleCheck", workspace, key, Map.of("scope", Map.of("objectTypeCode", objectTypeCode)));
  }

  private Map<String, Object> metaCommand(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    return envelope(type, workspace, key, payload);
  }

  private Map<String, Object> command(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    return envelope(type, workspace, key, payload);
  }

  private Map<String, Object> envelope(
      String type, UUID workspace, String key, Map<String, Object> payload) {
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", workspace);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", key);
    request.put("commandType", type);
    request.put("payload", payload);
    return request;
  }

  private UUID createObject(
      UUID workspace, UUID objectType, String key, Map<String, Object> fields) {
    var response = command(workspace, createObjectCommand(workspace, objectType, key, fields));
    assertOk(response);
    applyEvents(response);
    return createdObjectId(response.getBody());
  }

  private ResponseEntity<Map> meta(UUID workspace, Object request) {
    return post(workspace, "/meta-commands", request);
  }

  private ResponseEntity<Map> command(UUID workspace, Object request) {
    return post(workspace, "/commands", request);
  }

  private ResponseEntity<Map> rule(UUID workspace, Object request) {
    return post(workspace, "/rule-commands", request);
  }

  private ResponseEntity<Map> post(UUID workspace, String path, Object request) {
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", ACTOR);
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + workspace + path,
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private String runId(ResponseEntity<Map> response) {
    assertOk(response);
    return (String) ((List<?>) response.getBody().get("events")).getFirst();
  }

  private UUID createdObjectId(Map<?, ?> body) {
    for (var eventId : (List<?>) body.get("events")) {
      var objectId =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (objectId != null) return UUID.fromString(objectId);
    }
    throw new IllegalStateException("CreateObject did not emit ObjectCreated");
  }

  private void applyEvents(ResponseEntity<Map> response) {
    assertOk(response);
    for (var eventId : (List<?>) response.getBody().get("events")) {
      var payload =
          jdbc.query(
              "SELECT payload::text FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (payload != null) {
        try {
          projection.apply(mapper.readValue(payload, EventEnvelope.class));
        } catch (Exception failure) {
          throw new IllegalStateException("read model projection failed", failure);
        }
      }
    }
  }

  private void assertDecimal(String expected, Object actual) {
    assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) actual));
  }

  private List<String> templateCodes() {
    var response =
        http.getForEntity("http://localhost:" + port + "/views/templates", List.class).getBody();
    return response.stream().map(item -> (String) ((Map<?, ?>) item).get("code")).toList();
  }

  private UUID templateId(String code) {
    return jdbc.queryForObject("SELECT id FROM scene_template WHERE code = ?", UUID.class, code);
  }

  private String templateStatus(String code) {
    return jdbc.queryForObject(
        """
        SELECT version.status
        FROM scene_template template
        JOIN scene_template_version version ON version.template_id = template.id
        WHERE template.code = ?
        ORDER BY version.version DESC
        LIMIT 1
        """,
        String.class,
        code);
  }

  private int templateCount(String code) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM scene_template WHERE code = ?", Integer.class, code);
  }

  private int templateVersionCount(String code) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM scene_template template
        JOIN scene_template_version version ON version.template_id = template.id
        WHERE template.code = ?
        """,
        Integer.class,
        code);
  }

  private int copiedCount(String table, UUID workspace) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM " + table + " WHERE workspace_id = ? AND template_version_id IS NULL",
        Integer.class,
        workspace);
  }

  private UUID objectType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
  }

  private UUID objectType(UUID workspace, UUID templateVersionId, String code) {
    return jdbc.queryForObject(
        """
        SELECT id FROM object_type
        WHERE workspace_id = ?
          AND template_version_id IS NOT DISTINCT FROM ?
          AND code = ?
        """,
        UUID.class,
        workspace,
        templateVersionId,
        code);
  }

  private int objectTypeCount(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM object_type WHERE workspace_id = ? AND code = ?",
        Integer.class,
        workspace,
        code);
  }

  private int workspaceProfileCount(UUID workspace) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM workspace_profile WHERE workspace_id = ?", Integer.class, workspace);
  }

  private UUID templateVersionId(String templateCode, int version) {
    return jdbc.queryForObject(
        """
        SELECT version.id
        FROM scene_template template
        JOIN scene_template_version version ON version.template_id = template.id
        WHERE template.code = ? AND version.version = ?
        """,
        UUID.class,
        templateCode,
        version);
  }

  private void assertObjectType(UUID objectId, UUID objectTypeId) {
    assertEquals(
        objectTypeId,
        jdbc.queryForObject(
            "SELECT object_type_id FROM data_object WHERE id = ?", UUID.class, objectId));
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> workspaceProfiles(UUID workspace) {
    var rows =
        http.getForEntity("http://localhost:" + port + "/views/workspaces", Map[].class).getBody();
    for (var row : rows) {
      if (workspace.toString().equals(String.valueOf(row.get("workspaceId")))) {
        return (List<Map<String, Object>>) row.get("profiles");
      }
    }
    return List.of();
  }

  private UUID relationType(UUID workspace, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspace,
        code);
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

  private String ruleStatus(UUID workspace, UUID objectId) {
    var response =
        http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + workspace
                + "/views/rule-status?objectIds="
                + objectId,
            List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
    return (String) ((Map<?, ?>) response.getBody().getFirst()).get("ruleStatus");
  }

  private String errorCode(ResponseEntity<Map> response) {
    return (String) ((Map<?, ?>) response.getBody().get("error")).get("code");
  }
}
