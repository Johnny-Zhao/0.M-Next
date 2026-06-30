package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
class XmiIdentityBaselineMigrationIntegrationTest {
  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  @Test
  void cleanSchemaCreatesXmiIdentityAndBaselineTables() {
    var schema = "xmi_identity_clean_" + suffix();

    migrateLatest(schema);
    var jdbc = jdbc(schema);

    assertEquals(1, tableCount(jdbc, "xmi_identity"));
    assertEquals(1, tableCount(jdbc, "xmi_baseline_document"));
    assertEquals("NO", nullable(jdbc, "xmi_identity", "project_ref"));
    assertEquals("NO", nullable(jdbc, "xmi_baseline_document", "content"));
  }

  @Test
  void existingSchemaMigratesWithoutChangingExistingData() {
    var schema = "xmi_identity_existing_" + suffix();

    migrate(schema, MigrationVersion.fromVersion("29"));
    var jdbc = jdbc(schema);
    var workspacesBefore = workspaceCount(jdbc);

    migrateLatest(schema);

    assertEquals(workspacesBefore, workspaceCount(jdbc));
    assertEquals(0, rowCount(jdbc, "xmi_identity"));
    assertEquals(0, rowCount(jdbc, "xmi_baseline_document"));
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

  private static int tableCount(JdbcTemplate jdbc, String table) {
    return jdbc.queryForObject(
        """
        SELECT count(*) FROM information_schema.tables
        WHERE table_name = ?
        """,
        Integer.class,
        table);
  }

  private static String nullable(JdbcTemplate jdbc, String table, String column) {
    return jdbc.queryForObject(
        """
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_name = ? AND column_name = ?
        """,
        String.class,
        table,
        column);
  }

  private static int workspaceCount(JdbcTemplate jdbc) {
    return jdbc.queryForObject("SELECT count(*) FROM workspace", Integer.class);
  }

  private static int rowCount(JdbcTemplate jdbc, String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private static String suffix() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }
}
