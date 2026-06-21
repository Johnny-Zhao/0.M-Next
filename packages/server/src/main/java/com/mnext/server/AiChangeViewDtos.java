package com.mnext.server;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

record AiChangeSetView(
    UUID setId,
    String action,
    String status,
    String provider,
    String providerVersion,
    String contextHash,
    String resultText,
    Instant createdAt,
    long applied,
    long skipped,
    List<AiChangeItemView> items) {}

record AiChangeItemView(
    UUID itemId,
    int seq,
    String opType,
    Map<String, Object> payload,
    Map<String, Object> precheck,
    String itemStatus) {}
