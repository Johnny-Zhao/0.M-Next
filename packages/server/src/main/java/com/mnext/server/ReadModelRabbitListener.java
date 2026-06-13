package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.events.EventEnvelope;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
class ReadModelRabbitListener {
  private final ObjectMapper mapper;
  private final ReadModelProjection projection;

  ReadModelRabbitListener(ObjectMapper mapper, ReadModelProjection projection) {
    this.mapper = mapper;
    this.projection = projection;
  }

  @RabbitListener(
      queues = "${mnext.readmodel.queue:readmodel.events}",
      autoStartup = "${mnext.readmodel.enabled:false}")
  void receive(String payload) throws JsonProcessingException {
    projection.apply(mapper.readValue(payload, EventEnvelope.class));
  }
}
