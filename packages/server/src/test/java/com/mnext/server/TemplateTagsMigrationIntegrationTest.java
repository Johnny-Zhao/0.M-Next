package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
class TemplateTagsMigrationIntegrationTest {
  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  @Test
  void cleanSchemaMigratesWithNullableTemplateTagsColumn() {
    var schema = "template_tags_clean_" + suffix();

    migrateLatest(schema);
    var jdbc = jdbc(schema);

    assertEquals("jsonb", columnType(jdbc));
    assertEquals("YES", nullable(jdbc));
  }

  @Test
  void existingSchemaKeepsTemplateVersionsWithoutBackfill() {
    var schema = "template_tags_existing_" + suffix();

    migrate(schema, MigrationVersion.fromVersion("28"));
    var jdbc = jdbc(schema);
    var template = UUID.randomUUID();
    var version = UUID.randomUUID();
    insertTemplate(jdbc, template, version);

    migrateLatest(schema);

    assertEquals(1, templateVersionCount(jdbc, version));
    assertNull(tags(jdbc, version));
  }

  private static void migrateLatest(String schema) {
    migrate(schema, MigrationVersion.LATEST);
  }

  private static void migrate(String schema, MigrationVersion target) {
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .schemas(schema)
        .defaultSchema(schema)
        .locations("classpath:db/migration")
        .target(target)
        .load()
        .migrate();
  }

  private static JdbcTemplate jdbc(String schema) {
    var separator = POSTGRES.getJdbcUrl().contains("?") ? "&" : "?";
    var dataSource =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl() + separator + "currentSchema=" + schema,
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    return new JdbcTemplate(dataSource);
  }

  private static String columnType(JdbcTemplate jdbc) {
    return jdbc.queryForObject(
        """
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'scene_template_version' AND column_name = 'tags'
        """,
        String.class);
  }

  private static String nullable(JdbcTemplate jdbc) {
    return jdbc.queryForObject(
        """
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_name = 'scene_template_version' AND column_name = 'tags'
        """,
        String.class);
  }

  private static void insertTemplate(JdbcTemplate jdbc, UUID template, UUID version) {
    var now = Timestamp.from(Instant.parse("2026-06-30T00:00:00Z"));
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, 'existing_template', 'Existing Template', 'migration-test', ?)
        """,
        template,
        now);
    jdbc.update(
        """
        INSERT INTO scene_template_version
          (id, template_id, version, status, published_at, published_by)
        VALUES (?, ?, 1, 'published', ?, 'migration-test')
        """,
        version,
        template,
        now);
  }

  private static int templateVersionCount(JdbcTemplate jdbc, UUID version) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM scene_template_version WHERE id = ?", Integer.class, version);
  }

  private static String tags(JdbcTemplate jdbc, UUID version) {
    return jdbc.query(
        "SELECT tags::text FROM scene_template_version WHERE id = ?",
        result -> result.next() ? result.getString(1) : null,
        version);
  }

  private static String suffix() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }
}
