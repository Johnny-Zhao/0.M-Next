package com.mnext.server;

import java.util.UUID;

interface OutboxPublisher {
  void publish(UUID workspaceId, String payload);
}
