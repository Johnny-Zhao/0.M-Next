package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

@Component
class ReadModelRabbitListener {
  private final ObjectMapper mapper;
  private final ReadModelProjection projection;

  ReadModelRabbitListener(ObjectMapper mapper, ReadModelProjection projection) {
    this.mapper = mapper;
    this.projection = projection;
  }

  /**
   * 启动时声明共享读模型队列,监听器无需等首个事件被发布即可就绪(监听裸队列名只能被动声明, 队列不存在时会反复 404 重试)。队列名与 RabbitOutboxPublisher
   * 投递及下方监听默认值一致。
   */
  @Bean
  Queue readModelQueue() {
    return new Queue(RabbitOutboxPublisher.READMODEL_QUEUE, true);
  }

  @RabbitListener(
      queues = "${mnext.readmodel.queue:readmodel.events}",
      autoStartup = "${mnext.readmodel.enabled:false}")
  void receive(String payload) throws JsonProcessingException {
    projection.apply(mapper.readValue(payload, EventEnvelope.class));
  }
}
