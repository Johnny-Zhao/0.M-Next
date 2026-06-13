package com.mnext.server;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public final class IdempotentConsumerRegistry {
  private final Set<String> processed = ConcurrentHashMap.newKeySet();

  public boolean dispatch(Object consumer, String eventId, Runnable action) {
    var registration = consumer.getClass().getAnnotation(IdempotentConsumer.class);
    if (registration == null) {
      throw new IllegalArgumentException("消费者必须使用 @IdempotentConsumer 注册");
    }
    return accept(registration.group(), eventId, action);
  }

  private boolean accept(String consumerGroup, String eventId, Runnable action) {
    var key = consumerGroup + ":" + eventId;
    if (!processed.add(key)) return false;
    try {
      action.run();
      return true;
    } catch (RuntimeException failure) {
      processed.remove(key);
      throw failure;
    }
  }
}
