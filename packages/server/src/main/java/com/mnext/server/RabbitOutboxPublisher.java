package com.mnext.server;

import java.util.UUID;
import org.springframework.amqp.core.AmqpAdmin;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
final class RabbitOutboxPublisher implements OutboxPublisher {
  private final RabbitTemplate rabbit;
  private final AmqpAdmin admin;

  RabbitOutboxPublisher(RabbitTemplate rabbit, AmqpAdmin admin) {
    this.rabbit = rabbit;
    this.admin = admin;
  }

  @Override
  public void publish(UUID workspaceId, String payload) {
    var channel = channel(workspaceId);
    admin.declareQueue(new Queue(channel, true));
    rabbit.invoke(
        operations -> {
          operations.convertAndSend("", channel, payload);
          operations.waitForConfirmsOrDie(5_000);
          return null;
        });
  }

  String receive(UUID workspaceId) {
    return (String) rabbit.receiveAndConvert(channel(workspaceId), 5_000);
  }

  private static String channel(UUID workspaceId) {
    return "workspace." + workspaceId + ".events";
  }
}
