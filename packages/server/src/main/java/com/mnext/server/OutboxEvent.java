package com.mnext.server;

import java.util.UUID;

record OutboxEvent(
    String id, UUID workspaceId, String aggregateId, long sequence, String payload) {}
