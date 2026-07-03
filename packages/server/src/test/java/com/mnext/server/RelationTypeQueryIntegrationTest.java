package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.server.plugin.ProfileManifest;
import java.nio.file.Files;
import java.nio.file.Path;
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
class RelationTypeQueryIntegrationTest {
  private static final UUID AUTHOR = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TECHNICAL_WORKSPACE =
      UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final String ACTOR = "relation-types-user";

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
  @LocalServerPort int port;

  @Test
  void relationTypesViewExposesProposalContainsModuleWithUuidId() throws Exception {
    var manifest = technicalProposalManifest();
    loader.install(manifest, Actor.user(ACTOR));
    var template = templateId(manifest.templateCode());
    assertOk(instantiate(template, TECHNICAL_WORKSPACE));

    var response =
        http.getForEntity(
            "http://localhost:"
                + port
                + "/workspaces/"
                + TECHNICAL_WORKSPACE
                + "/views/relation-types",
            List.class);
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> body = response.getBody();
    var containsModule =
        body.stream()
            .filter(item -> "proposal_contains_module".equals(item.get("code")))
            .findFirst()
            .orElseThrow(
                () -> new AssertionError("relation-types 缺少 proposal_contains_module: " + body));
    assertNotNull(UUID.fromString((String) containsModule.get("id")));
    assertEquals("proposal_contains_module", containsModule.get("name"));
    assertTrue((Boolean) containsModule.get("hierarchical"));
  }

  private ProfileManifest technicalProposalManifest() throws Exception {
    var path =
        Path.of("..", "..", "packages", "domains", "technical-proposal", "profile.manifest.json")
            .normalize();
    if (!Files.exists(path)) {
      path = Path.of("packages", "domains", "technical-proposal", "profile.manifest.json");
    }
    try (var input = Files.newInputStream(path)) {
      return mapper.readValue(input, ProfileManifest.class);
    }
  }

  private ResponseEntity<Map> instantiate(UUID template, UUID newWorkspace) {
    var payload = new LinkedHashMap<String, Object>();
    payload.put("templateId", template);
    payload.put("version", 1);
    payload.put("newWorkspaceId", newWorkspace);
    payload.put("workspaceName", "技术方案 Demo");
    var request = new LinkedHashMap<String, Object>();
    request.put("workspaceId", AUTHOR);
    request.put("correlationId", UUID.randomUUID());
    request.put("idempotencyKey", "instantiate-relation-types");
    request.put("commandType", "InstantiateWorkspace");
    request.put("payload", payload);
    var headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Actor-Id", ACTOR);
    return http.postForEntity(
        "http://localhost:" + port + "/workspaces/" + AUTHOR + "/meta-commands",
        new HttpEntity<>(request, headers),
        Map.class);
  }

  private void assertOk(ResponseEntity<Map> response) {
    assertEquals(200, response.getStatusCode().value(), String.valueOf(response.getBody()));
  }

  private UUID templateId(String code) {
    return jdbc.queryForObject("SELECT id FROM scene_template WHERE code = ?", UUID.class, code);
  }
}
