package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(properties = "mnext.outbox.enabled=false")
class OutboxRelayIntegrationTest {
  private static final UUID WORKSPACE = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final String EVENT_ONE = "01ARZ3NDEKTSV4RRFFQ69G5FA1";
  private static final String EVENT_TWO = "01ARZ3NDEKTSV4RRFFQ69G5FA2";
  private static final String EVENT_FAIL = "01ARZ3NDEKTSV4RRFFQ69G5FA3";
  private static final String EVENT_CONCURRENT = "01ARZ3NDEKTSV4RRFFQ69G5FA4";

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired JdbcTemplate jdbc;
  @Autowired PlatformTransactionManager transactionManager;
  private CapturingPublisher publisher;
  private TestOutboxRelay relay;

  @BeforeEach
  void reset() {
    jdbc.update("DELETE FROM event_outbox");
    publisher = new CapturingPublisher();
    relay =
        new TestOutboxRelay(
            new OutboxRelay(jdbc, publisher), new TransactionTemplate(transactionManager));
  }

  @Test
  void drainPublishesInAggregateSequenceAndMarksRows() {
    insert(EVENT_TWO, "aggregate-a", 2);
    insert(EVENT_ONE, "aggregate-a", 1);

    assertEquals(1, relay.drain());
    assertEquals(1, relay.drain());
    assertEquals(List.of(EVENT_ONE, EVENT_TWO), publisher.ids);
    assertEquals(
        2,
        jdbc.queryForObject(
            "SELECT count(*) FROM event_outbox WHERE status = 'PUBLISHED' AND published_at IS NOT NULL",
            Integer.class));
  }

  @Test
  void failedPublishIncrementsRetryAndKeepsPending() {
    publisher.fail = true;
    insert(EVENT_FAIL, "aggregate-fail", 1);

    assertEquals(0, relay.drain());
    assertEquals(
        "PENDING:1",
        jdbc.queryForObject(
            "SELECT status || ':' || retry_count FROM event_outbox WHERE id = '" + EVENT_FAIL + "'",
            String.class));
  }

  @Test
  void concurrentRelaysDoNotPublishSameEventTwice() throws Exception {
    insert(EVENT_CONCURRENT, "aggregate-concurrent", 1);
    var second =
        new TestOutboxRelay(
            new OutboxRelay(jdbc, publisher), new TransactionTemplate(transactionManager));

    try (var workers = Executors.newFixedThreadPool(2)) {
      var firstResult = workers.submit(relay::drain);
      var secondResult = workers.submit(second::drain);

      assertEquals(
          1, firstResult.get(10, TimeUnit.SECONDS) + secondResult.get(10, TimeUnit.SECONDS));
      assertEquals(List.of(EVENT_CONCURRENT), publisher.ids);
    }
  }

  private void insert(String id, String aggregateId, long sequence) {
    jdbc.update(
        """
        INSERT INTO event_outbox
          (id, event_type, aggregate_type, aggregate_id, sequence, payload, created_at)
        VALUES (?, 'ObjectCreated', 'object', ?, ?, CAST(? AS jsonb), now())
        """,
        id,
        aggregateId,
        sequence,
        "{\"eventId\":\"" + id + "\",\"workspaceId\":\"" + WORKSPACE + "\"}");
  }

  private static final class CapturingPublisher implements OutboxPublisher {
    private final List<String> ids = new CopyOnWriteArrayList<>();
    private boolean fail;

    @Override
    public void publish(UUID workspaceId, String payload) {
      assertNotNull(workspaceId);
      if (fail) throw new IllegalStateException("injected");
      var marker = "\"eventId\": \"";
      var start = payload.indexOf(marker) + marker.length();
      ids.add(payload.substring(start, payload.indexOf('"', start)));
      assertTrue(payload.contains(WORKSPACE.toString()));
    }
  }
}
