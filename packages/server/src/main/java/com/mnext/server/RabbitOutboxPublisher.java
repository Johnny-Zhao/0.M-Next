package com.mnext.server;

import java.util.UUID;
import org.springframework.amqp.core.AmqpAdmin;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
final class RabbitOutboxPublisher implements OutboxPublisher {
  // 共享读模型队列:所有工作空间的事件都投一份到这里,读模型监听器统一消费(默认队列名,
  // 与 ReadModelRabbitListener 的 ${mnext.readmodel.queue:readmodel.events} 默认值一致)。
  static final String READMODEL_QUEUE = "readmodel.events";
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
    admin.declareQueue(new Queue(READMODEL_QUEUE, true));
    rabbit.invoke(
        operations -> {
          // 每个事件同时进入 per-workspace 队列与共享读模型队列;重复消费由读模型幂等去重兜底。
          operations.convertAndSend("", channel, payload);
          operations.convertAndSend("", READMODEL_QUEUE, payload);
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
