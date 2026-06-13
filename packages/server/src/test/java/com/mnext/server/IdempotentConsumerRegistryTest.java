package com.mnext.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class IdempotentConsumerRegistryTest {
  @Test
  void duplicateEventOnlyAppliesOnce() {
    var calls = new AtomicInteger();
    var registry = new IdempotentConsumerRegistry();
    var consumer = new DrainConsumer();

    assertTrue(registry.dispatch(consumer, "event-1", calls::incrementAndGet));
    assertFalse(registry.dispatch(consumer, "event-1", calls::incrementAndGet));
    assertEquals(1, calls.get());
  }

  @Test
  void failedEventCanBeRetried() {
    var registry = new IdempotentConsumerRegistry();
    var consumer = new DrainConsumer();

    assertThrows(
        IllegalStateException.class,
        () ->
            registry.dispatch(
                consumer,
                "event-2",
                () -> {
                  throw new IllegalStateException("retry");
                }));
    assertTrue(registry.dispatch(consumer, "event-2", () -> {}));
  }

  @IdempotentConsumer(group = "drain-test")
  private static final class DrainConsumer {}
}
