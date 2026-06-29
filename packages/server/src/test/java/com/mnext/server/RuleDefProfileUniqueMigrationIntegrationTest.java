package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

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
class RuleDefProfileUniqueMigrationIntegrationTest {
  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(
          DockerImageName.parse(
              System.getenv().getOrDefault("POSTGRES_TEST_IMAGE", "postgres:16-alpine")));

  @Test
  void cleanSchemaMigratesWithProfileScopedRuleCodeConstraint() {
    var schema = "rule_def_clean_" + suffix();

    migrateLatest(schema);
    var jdbc = jdbc(schema);

    assertEquals(
        "UNIQUE NULLS NOT DISTINCT (workspace_id, template_version_id, rule_code)",
        constraintDef(jdbc, "rule_def_ws_tv_rule_code_key"));
    assertEquals(0, countConstraint(jdbc, "rule_def_workspace_id_rule_code_key"));
  }

  @Test
  void existingSchemaKeepsRulesAndAllowsSameCodeAcrossTemplateVersions() {
    var schema = "rule_def_existing_" + suffix();

    migrate(schema, MigrationVersion.fromVersion("25"));
    var jdbc = jdbc(schema);
    var workspace = UUID.randomUUID();
    var firstVersion = UUID.randomUUID();
    var secondVersion = UUID.randomUUID();
    var firstType = UUID.randomUUID();
    var secondType = UUID.randomUUID();
    insertProfileSkeleton(jdbc, workspace, firstVersion, secondVersion, firstType, secondType);
    insertRule(jdbc, workspace, firstVersion, firstType, "profile_rule", UUID.randomUUID());

    migrateLatest(schema);

    assertEquals(1, countRules(jdbc, workspace, "profile_rule"));
    insertRule(jdbc, workspace, secondVersion, secondType, "profile_rule", UUID.randomUUID());
    assertEquals(2, countRules(jdbc, workspace, "profile_rule"));
    assertThrows(
        RuntimeException.class,
        () ->
            insertRule(
                jdbc, workspace, secondVersion, secondType, "profile_rule", UUID.randomUUID()));
  }

  @Test
  void existingDuplicatesStopMigrationBeforeReplacingConstraint() {
    var schema = "rule_def_duplicate_" + suffix();

    migrate(schema, MigrationVersion.fromVersion("25"));
    var jdbc = jdbc(schema);
    var workspace = UUID.randomUUID();
    var version = UUID.randomUUID();
    var objectType = UUID.randomUUID();
    insertProfileSkeleton(jdbc, workspace, version, UUID.randomUUID(), objectType, UUID.randomUUID());
    insertRule(jdbc, workspace, version, objectType, "profile_rule", UUID.randomUUID());
    jdbc.update("ALTER TABLE rule_def DROP CONSTRAINT rule_def_workspace_id_rule_code_key");
    insertRule(jdbc, workspace, version, objectType, "profile_rule", UUID.randomUUID());

    assertThrows(RuntimeException.class, () -> migrateLatest(schema));
    assertEquals(2, countRules(jdbc, workspace, "profile_rule"));
    assertEquals(0, countConstraint(jdbc, "rule_def_ws_tv_rule_code_key"));
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

  private static String constraintDef(JdbcTemplate jdbc, String name) {
    return jdbc.queryForObject(
        """
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = 'rule_def'::regclass
          AND conname = ?
        """,
        String.class,
        name);
  }

  private static int countConstraint(JdbcTemplate jdbc, String name) {
    return jdbc.queryForObject(
        """
        SELECT count(*)
        FROM pg_constraint
        WHERE conrelid = 'rule_def'::regclass
          AND conname = ?
        """,
        Integer.class,
        name);
  }

  private static void insertProfileSkeleton(
      JdbcTemplate jdbc,
      UUID workspace,
      UUID firstVersion,
      UUID secondVersion,
      UUID firstType,
      UUID secondType) {
    var firstTemplate = UUID.randomUUID();
    var secondTemplate = UUID.randomUUID();
    var now = Instant.parse("2026-06-29T00:00:00Z");
    jdbc.update(
        "INSERT INTO workspace (id, name, status) VALUES (?, ?, 'ACTIVE')",
        workspace,
        "Rule profile workspace");
    insertTemplate(jdbc, firstTemplate, "profile_a", "Profile A", now);
    insertTemplate(jdbc, secondTemplate, "profile_b", "Profile B", now);
    insertTemplateVersion(jdbc, firstVersion, firstTemplate, now);
    insertTemplateVersion(jdbc, secondVersion, secondTemplate, now);
    insertObjectType(
        jdbc, firstType, workspace, firstVersion, "requirement_a", "Requirement A", now);
    insertObjectType(
        jdbc, secondType, workspace, secondVersion, "requirement_b", "Requirement B", now);
  }

  private static void insertTemplate(
      JdbcTemplate jdbc, UUID id, String code, String name, Instant now) {
    jdbc.update(
        """
        INSERT INTO scene_template (id, code, name, created_by, created_at)
        VALUES (?, ?, ?, 'migration-test', ?)
        """,
        id,
        code,
        name,
        timestamp(now));
  }

  private static void insertTemplateVersion(
      JdbcTemplate jdbc, UUID id, UUID template, Instant now) {
    jdbc.update(
        """
        INSERT INTO scene_template_version
          (id, template_id, version, status, published_at, published_by)
        VALUES (?, ?, 1, 'published', ?, 'migration-test')
        """,
        id,
        template,
        timestamp(now));
  }

  private static void insertObjectType(
      JdbcTemplate jdbc,
      UUID id,
      UUID workspace,
      UUID templateVersion,
      String code,
      String name,
      Instant now) {
    jdbc.update(
        """
        INSERT INTO object_type
          (id, workspace_id, template_version_id, code, name, parent_type_id, published,
           created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, TRUE, 'migration-test', 'migration-test', ?, ?)
        """,
        id,
        workspace,
        templateVersion,
        code,
        name,
        timestamp(now),
        timestamp(now));
  }

  private static void insertRule(
      JdbcTemplate jdbc,
      UUID workspace,
      UUID templateVersion,
      UUID objectType,
      String ruleCode,
      UUID ruleId) {
    var now = Instant.parse("2026-06-29T00:00:00Z");
    jdbc.update(
        """
        INSERT INTO rule_def
          (id, workspace_id, template_version_id, rule_code, scope_object_type_id,
           scope_field_def_id, severity, when_src, message, impact, suggest, fix,
           lightweight, published, version, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, 'WARN', 'true', 'Profile scoped rule',
           NULL, NULL, NULL, FALSE, TRUE, 1, 'migration-test', 'migration-test', ?, ?)
        """,
        ruleId,
        workspace,
        templateVersion,
        ruleCode,
        objectType,
        timestamp(now),
        timestamp(now));
  }

  private static int countRules(JdbcTemplate jdbc, UUID workspace, String ruleCode) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM rule_def WHERE workspace_id = ? AND rule_code = ?",
        Integer.class,
        workspace,
        ruleCode);
  }

  private static String suffix() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  private static Timestamp timestamp(Instant instant) {
    return Timestamp.from(instant);
  }
}
