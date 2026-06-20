package com.mnext.server.ai;

import java.util.List;
import java.util.Map;

public interface AiActionProvider {
  ProviderDescriptor descriptor();

  AiResult execute(AiAction action, AiContext context);

  enum AiAction {
    SUGGEST_FIELDS,
    EXPLAIN_CHECK
  }

  record ProviderDescriptor(String providerId, String version) {}

  record AiResult(String text, List<AiChangeItem> items) {
    public AiResult {
      items = items == null ? List.of() : List.copyOf(items);
    }
  }

  record AiChangeItem(String opType, Map<String, Object> payload) {}
}
