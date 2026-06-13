package com.mnext.kernel.api;

import java.util.UUID;

public interface KernelQueryPort {
  boolean objectExists(UUID workspaceId, UUID objectId);

  boolean relationExists(UUID workspaceId, UUID relationId);

  boolean fieldDefExistsForObject(UUID workspaceId, UUID objectId, String fieldCode);
}
