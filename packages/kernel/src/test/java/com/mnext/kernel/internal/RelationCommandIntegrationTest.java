package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.ArchiveCommand;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.UnlinkCommand;
import com.mnext.kernel.api.commands.UpdateRelationCommand;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
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
@SpringBootTest(classes = RelationCommandIntegrationTest.TestApplication.class)
class RelationCommandIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID OBJECT_TYPE = UUID.fromString("22222222-2222-4222-8222-222222222222");
  private static final UUID DEPENDS = UUID.fromString("44444444-4444-4444-8444-444444444441");
  private static final UUID DECOMPOSES = UUID.fromString("44444444-4444-4444-8444-444444444442");

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
  void clean() {
    jdbc.update("DELETE FROM relation_closure");
    jdbc.update("DELETE FROM relation_history");
    jdbc.update("DELETE FROM data_relation");
    jdbc.update("DELETE FROM event_outbox");
    jdbc.update("DELETE FROM command_log");
    jdbc.update("DELETE FROM field_value_history");
    jdbc.update("DELETE FROM data_field_value");
    jdbc.update("DELETE FROM data_object");
  }

  @Test
  void duplicateRelationReturnsExistingId() {
    var endpoints = endpoints(2);
    createRelation("duplicate-a", DEPENDS, endpoints[0], endpoints[1]);

    var error =
        assertThrows(
            CommandRejectedException.class,
            () -> createRelation("duplicate-b", DEPENDS, endpoints[0], endpoints[1]));

    assertEquals("KERNEL-409-DUPLICATE-RELATION", error.error().code());
    assertTrue(error.error().details().containsKey("relationId"));
  }

  @Test
  void oneToManyRejectsSecondParent() {
    var objects = endpoints(3);
    createRelation("parent-a", DECOMPOSES, objects[0], objects[2]);

    var error =
        assertThrows(
            CommandRejectedException.class,
            () -> createRelation("parent-b", DECOMPOSES, objects[1], objects[2]));

    assertEquals("KERNEL-422-CARDINALITY-VIOLATION", error.error().code());
  }

  @Test
  void cycleRollsBackWithoutResidualRelation() {
    var objects = endpoints(3);
    createRelation("cycle-ab", DECOMPOSES, objects[0], objects[1]);
    createRelation("cycle-bc", DECOMPOSES, objects[1], objects[2]);
    var before = count("data_relation");

    var error =
        assertThrows(
            CommandRejectedException.class,
            () -> createRelation("cycle-ca", DECOMPOSES, objects[2], objects[0]));

    assertEquals("KERNEL-409-CYCLE-DETECTED", error.error().code());
    assertEquals(before, count("data_relation"));
  }

  @Test
  void missingAndDeletedEndpointUseSameError() {
    var source = createObject("endpoint-source");
    var deleted = createObject("endpoint-deleted");
    jdbc.update("UPDATE data_object SET status = 'DELETED' WHERE id = ?", deleted);
    var missing = UUID.randomUUID();

    var missingError = relationError("missing", source, missing);
    var deletedError = relationError("deleted", source, deleted);

    assertEquals("KERNEL-422-ENDPOINT-INVALID", missingError.error().code());
    assertEquals(missingError.error().code(), deletedError.error().code());
  }

  @Test
  void concurrentDuplicateHasExactlyOneWinner() throws Exception {
    var endpoints = endpoints(2);
    var start = new CountDownLatch(1);
    try (var executor = Executors.newFixedThreadPool(2)) {
      var first =
          executor.submit(
              () -> concurrentCreate(start, "concurrent-a", endpoints[0], endpoints[1]));
      var second =
          executor.submit(
              () -> concurrentCreate(start, "concurrent-b", endpoints[0], endpoints[1]));
      start.countDown();

      var outcomes = java.util.List.of(first.get(), second.get());
      assertEquals(1, outcomes.stream().filter("ok"::equals).count());
      assertEquals(1, outcomes.stream().filter("KERNEL-409-DUPLICATE-RELATION"::equals).count());
    }
    assertEquals(1, count("data_relation"));
  }

  @Test
  void unlinkIsIdempotentAndClearsClosure() {
    var endpoints = endpoints(2);
    var relationId = createRelation("unlink-create", DECOMPOSES, endpoints[0], endpoints[1]);
    assertEquals(1, count("relation_closure"));

    var first = commands.unlink(unlink("unlink-a", relationId, 1), Actor.user("unlinker"));
    var second = commands.unlink(unlink("unlink-b", relationId, 1), Actor.user("unlinker"));

    assertEquals(1, first.events().size());
    assertTrue(second.events().isEmpty());
    assertEquals(0, count("relation_closure"));
  }

  @Test
  void updateEndpointRevalidatesDuplicate() {
    var objects = endpoints(3);
    createRelation("update-existing", DEPENDS, objects[0], objects[2]);
    var relationId = createRelation("update-source", DEPENDS, objects[0], objects[1]);

    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                commands.updateRelation(
                    update("update-endpoint", relationId, objects[2]), Actor.user("u")));

    assertEquals("KERNEL-409-DUPLICATE-RELATION", error.error().code());
  }

  @Test
  void createRelationReplayHasZeroSideEffects() {
    var endpoints = endpoints(2);
    var command = createCommand("relation-replay", DEPENDS, endpoints[0], endpoints[1]);

    commands.createRelation(command, Actor.user("creator"));
    var eventCount = count("event_outbox");
    var replay = commands.createRelation(command, Actor.user("creator"));

    assertTrue(replay.idempotentReplay());
    assertEquals(eventCount, count("event_outbox"));
    assertEquals(1, count("data_relation"));
  }

  @Test
  void archiveRejectsThenUnlinksThreeRelationsInOneCorrelation() {
    var objects = endpoints(4);
    for (var index = 1; index < objects.length; index++) {
      createRelation("archive-relation-" + index, DEPENDS, objects[0], objects[index]);
    }
    var rejected =
        assertThrows(
            CommandRejectedException.class,
            () ->
                commands.archive(archive("archive-reject", objects[0], "reject"), Actor.user("u")));
    var correlation = UUID.randomUUID();
    var beforeEvents = count("event_outbox");
    var result =
        commands.archive(
            archive("archive-unlink", objects[0], "unlink", correlation), Actor.user("u"));

    assertEquals("KERNEL-422-ACTIVE-RELATIONS", rejected.error().code());
    assertEquals(4, result.events().size());
    assertEquals(beforeEvents + 4, count("event_outbox"));
    assertEquals(
        4,
        jdbc.queryForObject(
            "SELECT count(*) FROM event_outbox WHERE payload->>'correlationId' = ?",
            Integer.class,
            correlation.toString()));
  }

  @Test
  void archiveCascadeOverFiftyRollsBackWithoutResidualChanges() {
    var objects = endpoints(52);
    for (var index = 1; index < objects.length; index++) {
      createRelation("large-cascade-" + index, DEPENDS, objects[0], objects[index]);
    }
    var beforeEvents = count("event_outbox");
    var beforeCommands = count("command_log");

    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                commands.archive(archive("large-cascade", objects[0], "unlink"), Actor.user("u")));

    assertEquals("KERNEL-413-CASCADE-TOO-LARGE", error.error().code());
    assertEquals(
        51,
        jdbc.queryForObject(
            "SELECT count(*) FROM data_relation WHERE status = 'ACTIVE'", Integer.class));
    assertEquals(beforeEvents, count("event_outbox"));
    assertEquals(beforeCommands, count("command_log"));
  }

  @Test
  void repeatedArchiveIsIdempotentWithNoSecondEvent() {
    var object = createObject("archive-repeat-object");

    var first = commands.archive(archive("archive-repeat-a", object, "reject"), Actor.user("u"));
    var second = commands.archive(archive("archive-repeat-b", object, "reject"), Actor.user("u"));

    assertEquals(1, first.events().size());
    assertTrue(second.events().isEmpty());
  }

  private CommandRejectedException relationError(String key, UUID source, UUID target) {
    return assertThrows(
        CommandRejectedException.class, () -> createRelation(key, DEPENDS, source, target));
  }

  private String concurrentCreate(CountDownLatch start, String key, UUID source, UUID target) {
    try {
      start.await();
      createRelation(key, DEPENDS, source, target);
      return "ok";
    } catch (CommandRejectedException error) {
      return error.error().code();
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(error);
    }
  }

  private UUID createRelation(String key, UUID type, UUID source, UUID target) {
    commands.createRelation(createCommand(key, type, source, target), Actor.user("creator"));
    return jdbc.queryForObject(
        "SELECT id FROM data_relation WHERE relation_type_id = ? AND source_id = ? AND target_id = ?",
        UUID.class,
        type,
        source,
        target);
  }

  private CreateRelationCommand createCommand(String key, UUID type, UUID source, UUID target) {
    return new CreateRelationCommand(
        WORKSPACE,
        UUID.randomUUID(),
        key,
        type,
        source,
        target,
        Map.of("weight", 1),
        new SourceInfo("manual", null));
  }

  private UpdateRelationCommand update(String key, UUID relationId, UUID targetId) {
    return new UpdateRelationCommand(
        WORKSPACE, UUID.randomUUID(), key, relationId, 1, null, null, targetId);
  }

  private UnlinkCommand unlink(String key, UUID relationId, long version) {
    return new UnlinkCommand(
        WORKSPACE,
        UUID.randomUUID(),
        key,
        relationId,
        null,
        null,
        null,
        "obsolete",
        version,
        false);
  }

  private ArchiveCommand archive(String key, UUID targetId, String policy) {
    return archive(key, targetId, policy, UUID.randomUUID());
  }

  private ArchiveCommand archive(String key, UUID targetId, String policy, UUID correlation) {
    return new ArchiveCommand(
        WORKSPACE, correlation, key, "object", targetId, "obsolete", 1, policy);
  }

  private UUID[] endpoints(int count) {
    var ids = new UUID[count];
    for (var index = 0; index < count; index++) {
      ids[index] = createObject("object-" + UUID.randomUUID());
    }
    return ids;
  }

  private UUID createObject(String key) {
    commands.createObject(
        new CreateObjectCommand(
            WORKSPACE,
            UUID.randomUUID(),
            key,
            OBJECT_TYPE,
            Map.of("name", key),
            new SourceInfo("manual", null),
            null),
        Actor.user("creator"));
    return jdbc.queryForObject(
        "SELECT id FROM data_object ORDER BY created_at DESC LIMIT 1", UUID.class);
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }
}
