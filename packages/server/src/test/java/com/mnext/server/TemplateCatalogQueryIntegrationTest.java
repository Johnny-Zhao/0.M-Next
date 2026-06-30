package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.UUID;
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
class TemplateCatalogQueryIntegrationTest {
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
  @LocalServerPort int port;

  @Test
  void templatesReturnLatestPublishedVersionWithBoundedTypeOverview() {
    var publishedTemplate = template("catalog_published");
    var version1 = templateVersion(publishedTemplate, 1, "published");
    templateObject(version1, "old_type", "Old Type");
    var version2 = templateVersion(publishedTemplate, 2, "published");
    templateObject(version2, "room", "Room");
    templateObject(version2, "zone", "Zone");
    tagVersion(
        version2,
        """
        {"industry":["工程"],"profession":["系统设计"],"scenario":["方案评审"]}
        """);
    var draftOnly = template("catalog_draft");
    templateVersion(draftOnly, 1, "draft");
    var empty = template("catalog_empty");
    templateVersion(empty, 1, "published");
    var many = template("catalog_many");
    var manyVersion = templateVersion(many, 1, "published");
    for (var index = 0; index < 25; index++) {
      templateObject(manyVersion, "type_" + String.format("%02d", index), "Type " + index);
    }

    var items = templates();

    assertFalse(items.stream().anyMatch(item -> code(draftOnly).equals(item.get("code"))));
    var published = item(items, code(publishedTemplate));
    assertEquals(2, published.get("version"));
    assertEquals(2, published.get("latestPublishedVersion"));
    assertNotNull(published.get("publishedAt"));
    assertNull(published.get("description"));
    assertEquals(List.of("工程"), tags(published, "industry"));
    assertEquals(List.of("系统设计"), tags(published, "profession"));
    assertEquals(List.of("方案评审"), tags(published, "scenario"));
    assertFalse((Boolean) published.get("typeOverviewTruncated"));
    var overview = overview(published);
    assertEquals(List.of("room", "zone"), overview.stream().map(type -> type.get("code")).toList());
    assertEquals(List.of("Room", "Zone"), overview.stream().map(type -> type.get("name")).toList());
    var emptyItem = item(items, code(empty));
    assertTrue(overview(emptyItem).isEmpty());
    assertEquals(List.of("未分类"), tags(emptyItem, "industry"));
    var manyItem = item(items, code(many));
    assertEquals(20, overview(manyItem).size());
    assertTrue((Boolean) manyItem.get("typeOverviewTruncated"));
  }

  private UUID template(String baseCode) {
    var template = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, ?, ?, 'test', CURRENT_TIMESTAMP)
        """,
        template,
        baseCode + "_" + template.toString().substring(0, 8),
        baseCode);
    return template;
  }

  private UUID templateVersion(UUID template, int version, String status) {
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO scene_template_version
          (id, template_id, version, status, published_at, published_by)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        """,
        id,
        template,
        version,
        status,
        AUTHOR);
    return id;
  }

  private void templateObject(UUID version, String code, String name) {
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, FALSE, 'test', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        UUID.randomUUID(),
        AUTHOR,
        version,
        code,
        name);
  }

  private void tagVersion(UUID version, String tags) {
    jdbc.update("UPDATE scene_template_version SET tags = ?::jsonb WHERE id = ?", tags, version);
  }

  private List<Map<String, Object>> templates() {
    return http.getForEntity("http://localhost:" + port + "/views/templates", List.class).getBody();
  }

  private Map<String, Object> item(List<Map<String, Object>> items, String code) {
    return items.stream().filter(item -> code.equals(item.get("code"))).findFirst().orElseThrow();
  }

  private List<Map<String, Object>> overview(Map<String, Object> item) {
    return (List<Map<String, Object>>) item.get("typeOverview");
  }

  private List<String> tags(Map<String, Object> item, String facet) {
    return (List<String>) ((Map<String, Object>) item.get("tags")).get(facet);
  }

  private String code(UUID template) {
    return jdbc.queryForObject(
        "SELECT code FROM scene_template WHERE id = ?", String.class, template);
  }
}
