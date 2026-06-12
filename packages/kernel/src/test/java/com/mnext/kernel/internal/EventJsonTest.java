package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.events.EventEnvelope;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EventJsonTest {
  @Test
  void serializesFieldChangedEnvelopeUsedByContractFixture() throws Exception {
    var event =
        new EventEnvelope(
            "01ARZ3NDEKTSV4RRFFQ69G5FAB",
            "FieldChanged",
            1,
            UUID.fromString("11111111-1111-4111-8111-111111111111"),
            "fieldValue",
            "33333333-3333-4333-8333-333333333333:cost",
            2,
            Map.of("fieldDefCode", "cost", "value", 10),
            Map.of("fieldDefCode", "cost", "value", 11),
            Actor.user("test-user"),
            "manual",
            Instant.parse("2026-06-12T00:00:00Z"),
            UUID.fromString("22222222-2222-4222-8222-222222222222"),
            "01ARZ3NDEKTSV4RRFFQ69G5FAA",
            2,
            null);
    var json = new ObjectMapper().readTree(EventJson.encode(event));

    assertEquals("FieldChanged", json.get("eventType").asText());
    assertEquals(10, json.get("before").get("value").asInt());
    assertEquals(11, json.get("after").get("value").asInt());
  }
}
