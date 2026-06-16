package com.mnext.kernel.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface RuleChecker {
  List<RuleViolation> check(
      UUID workspaceId, UUID objectTypeId, Map<String, Object> effectiveFieldValues, Actor actor);
}
