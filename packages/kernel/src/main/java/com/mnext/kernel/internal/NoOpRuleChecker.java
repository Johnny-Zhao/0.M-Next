package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.RuleChecker;
import com.mnext.kernel.api.RuleViolation;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class NoOpRuleChecker implements RuleChecker {
  @Override
  public List<RuleViolation> check(
      UUID workspaceId, UUID objectTypeId, Map<String, Object> effectiveFieldValues, Actor actor) {
    return List.of();
  }
}
