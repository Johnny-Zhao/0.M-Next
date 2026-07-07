package com.mnext.server;

import com.mnext.kernel.api.CommandResult;
import com.mnext.server.ai.AiActionProvider;
import java.util.UUID;

interface AiChangeSetSubmitter {
  CommandResult submitGenerated(
      UUID workspaceId,
      String actorId,
      String idempotencyKey,
      String action,
      AiActionProvider.ProviderDescriptor provider,
      String contextHash,
      AiActionProvider.AiResult aiResult,
      String payloadHash);

  String payloadHash(Object value);
}
