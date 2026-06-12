package com.mnext.kernel.internal;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.PermissionChecker;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

// TODO 阶段4 权限矩阵替换
@Component
public class AllowAllPermissionChecker implements PermissionChecker {
  @Override
  public void check(
      String permissionCode, UUID workspaceId, UUID targetId, Set<String> fieldCodes, Actor actor) {
    // Temporary hook intentionally allows all authenticated actors.
  }
}
