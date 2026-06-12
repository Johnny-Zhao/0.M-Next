package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.BatchCommand;
import com.mnext.kernel.api.commands.BatchItem;
import com.mnext.kernel.api.commands.ChangeStateCommand;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.FieldUpdate;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(classes = KernelCommandIntegrationTest.TestApplication.class)
class KernelCommandIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

  @SpringBootConfiguration
  @EnableAutoConfiguration
  @ComponentScan("com.mnext.kernel.internal")
  static class TestApplication {}

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired KernelCommandService commands;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void cleanCommands() {
    jdbc.update("DELETE FROM event_outbox");
    jdbc.update("DELETE FROM command_log");
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_object");
  }

  @Test
  void sameFieldConflictAndReplayAreTransactional() {
    var objectId = create("kernel-same", Map.of("name", "demo", "cost", 10));
    var first = update("kernel-a", objectId, 1, "cost", 11, 1L);
    commands.updateFields(first, Actor.user("actor-a"));
    var replay = commands.updateFields(first, Actor.user("actor-a"));
    var conflict =
        assertThrows(
            CommandRejectedException.class,
            () ->
                commands.updateFields(
                    update("kernel-b", objectId, 1, "cost", 12, 1L), Actor.user("actor-b")));

    assertTrue(replay.idempotentReplay());
    assertEquals("KERNEL-409-VERSION-CONFLICT", conflict.error().code());
    assertEquals(2, count("command_log"));
  }

  @Test
  void differentFieldVersionsMerge() {
    var objectId = create("kernel-different", Map.of("name", "demo", "cost", 10, "owner", "alice"));

    commands.updateFields(update("kernel-cost", objectId, 1, "cost", 11, 1L), Actor.user("a"));
    commands.updateFields(update("kernel-owner", objectId, 1, "owner", "bob", 1L), Actor.user("b"));

    assertEquals(
        3L,
        jdbc.queryForObject("SELECT version FROM data_object WHERE id = ?", Long.class, objectId));
  }

  @Test
  void reusedIdempotencyKeyWithDifferentPayloadIsRejected() {
    create("kernel-reused", Map.of("name", "first"));

    var error =
        assertThrows(
            CommandRejectedException.class,
            () -> create("kernel-reused", Map.of("name", "second")));

    assertEquals("KERNEL-409-IDEMPOTENCY-CONFLICT", error.error().code());
    assertEquals(1, count("data_object"));
  }

  @Test
  void stateMachineRejectsBackwardsAndAllowsVoid() {
    var objectId = create("state-object", Map.of("name", "state"));
    jdbc.update("UPDATE data_object SET status = 'CONFIRMED' WHERE id = ?", objectId);

    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                commands.changeState(
                    state("state-back", objectId, "CONFIRMED", "DRAFT"), Actor.user("u")));
    var result =
        commands.changeState(state("state-void", objectId, "CONFIRMED", "VOID"), Actor.user("u"));

    assertEquals("KERNEL-409-STATE-TRANSITION-INVALID", error.error().code());
    assertTrue(error.error().details().containsKey("allowedTransitions"));
    assertEquals(1, result.events().size());
    assertEquals(
        "VOID",
        jdbc.queryForObject("SELECT status FROM data_object WHERE id = ?", String.class, objectId));
  }

  @Test
  void fieldValueStateIsExplicitlyDeferred() {
    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                commands.changeState(
                    new ChangeStateCommand(
                        WORKSPACE,
                        UUID.randomUUID(),
                        "field-state",
                        "fieldValue",
                        UUID.randomUUID(),
                        "DRAFT",
                        "VOID",
                        "deferred",
                        1),
                    Actor.user("u")));

    assertEquals("KERNEL-400-SCHEMA-INVALID", error.error().code());
  }

  @Test
  void allOrNothingBatchFailureRollsBackChildren() {
    var missingType = UUID.randomUUID();
    var batch =
        batch(
            "batch-all",
            "all_or_nothing",
            List.of(
                new BatchItem("CreateObject", createCommand("batch-all#0", TYPE)),
                new BatchItem("CreateObject", createCommand("batch-all#1", missingType))));

    var error =
        assertThrows(CommandRejectedException.class, () -> commands.batch(batch, Actor.user("u")));

    assertEquals("KERNEL-404-TYPE-NOT-FOUND", error.error().code());
    assertEquals(0, count("data_object"));
    assertEquals(0, count("command_log"));
    assertEquals(0, count("event_outbox"));
  }

  @Test
  void partialBatchRetryOnlyCommitsPreviouslyFailedChild() {
    var delayedType = UUID.randomUUID();
    var batch =
        batch(
            "batch-partial",
            "partial",
            List.of(
                new BatchItem("CreateObject", createCommand("batch-partial#0", TYPE)),
                new BatchItem("CreateObject", createCommand("batch-partial#1", delayedType)),
                new BatchItem("CreateObject", createCommand("batch-partial#2", TYPE))));
    var first = commands.batch(batch, Actor.user("u"));
    insertObjectType(delayedType);
    var second = commands.batch(batch, Actor.user("u"));

    assertEquals(2, first.results().stream().filter(r -> r.error() == null).count());
    assertEquals(3, second.results().stream().filter(r -> r.error() == null).count());
    assertEquals(3, count("data_object"));
    assertEquals(4, count("command_log"));
  }

  @Test
  void batchRejectsNestedAndOverLimitPayloads() {
    var nested = batch("nested", "partial", List.of(new BatchItem("BatchCommand", null)));
    var tooMany = new java.util.ArrayList<BatchItem>();
    for (var index = 0; index < 201; index++) {
      tooMany.add(new BatchItem("CreateObject", createCommand("large#" + index, TYPE)));
    }

    var nestedError =
        assertThrows(CommandRejectedException.class, () -> commands.batch(nested, Actor.user("u")));
    var largeError =
        assertThrows(
            CommandRejectedException.class,
            () -> commands.batch(batch("large", "partial", tooMany), Actor.user("u")));

    assertEquals("KERNEL-400-NESTED-BATCH", nestedError.error().code());
    assertEquals("KERNEL-413-BATCH-TOO-LARGE", largeError.error().code());
  }

  @Test
  void updateFieldsRejectsTerminalObjectStates() {
    for (var state : List.of("VOID", "FILED", "DELETED")) {
      var object = create("terminal-" + state, Map.of("name", state));
      jdbc.update("UPDATE data_object SET status = ? WHERE id = ?", state, object);

      var error =
          assertThrows(
              CommandRejectedException.class,
              () ->
                  commands.updateFields(
                      update("update-" + state, object, 1, "name", "changed", 1L),
                      Actor.user("u")));

      assertEquals("KERNEL-410-TARGET-ARCHIVED", error.error().code());
    }
  }

  private UUID create(String key, Map<String, Object> fields) {
    commands.createObject(
        new CreateObjectCommand(
            WORKSPACE, UUID.randomUUID(), key, TYPE, fields, new SourceInfo("manual", null), null),
        Actor.user("creator"));
    return jdbc.queryForObject(
        "SELECT id FROM data_object ORDER BY created_at DESC LIMIT 1", UUID.class);
  }

  private CreateObjectCommand createCommand(String key, UUID type) {
    return new CreateObjectCommand(
        WORKSPACE,
        UUID.randomUUID(),
        key,
        type,
        Map.of("name", key),
        new SourceInfo("manual", null),
        null);
  }

  private BatchCommand batch(String key, String mode, List<BatchItem> items) {
    return new BatchCommand(WORKSPACE, UUID.randomUUID(), key, items, mode, null);
  }

  private void insertObjectType(UUID type) {
    jdbc.update(
        "INSERT INTO object_type (id, workspace_id, code, name, published) VALUES (?, ?, ?, ?, TRUE)",
        type,
        WORKSPACE,
        type.toString(),
        "Delayed");
    jdbc.update(
        "INSERT INTO field_def (id, object_type_id, code, name, required) VALUES (?, ?, 'name', 'Name', TRUE)",
        UUID.randomUUID(),
        type);
  }

  private UpdateFieldsCommand update(
      String key, UUID objectId, long objectVersion, String code, Object value, Long fieldVersion) {
    return new UpdateFieldsCommand(
        WORKSPACE,
        UUID.randomUUID(),
        key,
        objectId,
        objectVersion,
        List.of(new FieldUpdate(code, value, fieldVersion)));
  }

  private ChangeStateCommand state(String key, UUID targetId, String fromState, String toState) {
    return new ChangeStateCommand(
        WORKSPACE, UUID.randomUUID(), key, "object", targetId, fromState, toState, "reason", 1);
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }
}
