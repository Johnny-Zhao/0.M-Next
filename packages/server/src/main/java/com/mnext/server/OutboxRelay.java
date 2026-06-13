package com.mnext.server;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(name = "mnext.outbox.enabled", matchIfMissing = true)
class OutboxRelay {
  private static final int BATCH_SIZE = 500;
  private static final int MAX_RETRIES = 10;
  private static final Duration MAX_BACKOFF = Duration.ofMinutes(1);
  private final JdbcTemplate jdbc;
  private final OutboxPublisher publisher;
  private final Map<String, Instant> retryAfter = new ConcurrentHashMap<>();

  OutboxRelay(JdbcTemplate jdbc, OutboxPublisher publisher) {
    this.jdbc = jdbc;
    this.publisher = publisher;
  }

  @Scheduled(fixedDelayString = "${mnext.outbox.poll-delay:1000}")
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public int drain() {
    var published = 0;
    for (var event : pending()) {
      if (publish(event)) published++;
    }
    return published;
  }

  private List<OutboxEvent> pending() {
    return jdbc.query(
        """
        SELECT outbox.id, outbox.payload->>'workspaceId', outbox.aggregate_id,
               outbox.sequence, outbox.payload::text
        FROM event_outbox outbox
        WHERE outbox.status = 'PENDING'
          AND NOT EXISTS (
            SELECT 1 FROM event_outbox earlier
            WHERE earlier.status = 'PENDING'
              AND earlier.aggregate_type = outbox.aggregate_type
              AND earlier.aggregate_id = outbox.aggregate_id
              AND earlier.sequence < outbox.sequence)
        ORDER BY outbox.created_at, outbox.aggregate_id, outbox.sequence
        LIMIT ? FOR UPDATE OF outbox SKIP LOCKED
        """,
        (row, index) ->
            new OutboxEvent(
                row.getString(1),
                java.util.UUID.fromString(row.getString(2)),
                row.getString(3),
                row.getLong(4),
                row.getString(5)),
        BATCH_SIZE);
  }

  private boolean publish(OutboxEvent event) {
    if (Instant.now().isBefore(retryAfter.getOrDefault(event.id(), Instant.MIN))) return false;
    try {
      publisher.publish(event.workspaceId(), event.payload());
      markPublished(event.id());
      retryAfter.remove(event.id());
      return true;
    } catch (RuntimeException failure) {
      markFailed(event.id());
      return false;
    }
  }

  private void markPublished(String eventId) {
    jdbc.update(
        "UPDATE event_outbox SET status = 'PUBLISHED', published_at = ? WHERE id = ?",
        Timestamp.from(Instant.now()),
        eventId);
  }

  private void markFailed(String eventId) {
    var retries =
        jdbc.queryForObject(
            """
            UPDATE event_outbox SET retry_count = retry_count + 1,
              status = CASE WHEN retry_count + 1 > ? THEN 'QUARANTINED' ELSE 'PENDING' END
            WHERE id = ? RETURNING retry_count
            """,
            Integer.class,
            MAX_RETRIES,
            eventId);
    if (retries <= MAX_RETRIES) {
      var seconds = Math.min(1L << Math.min(retries - 1, 30), MAX_BACKOFF.toSeconds());
      retryAfter.put(eventId, Instant.now().plusSeconds(seconds));
    } else {
      retryAfter.remove(eventId);
    }
  }
}
