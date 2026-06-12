package com.mnext.kernel.api;

import java.util.Set;
import java.util.UUID;

public interface PermissionChecker {
  void check(
      String permissionCode, UUID workspaceId, UUID targetId, Set<String> fieldCodes, Actor actor);
}
