package com.mnext.kernel.internal;

import com.mnext.kernel.api.KernelQueryPort;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class KernelQueryAdapter implements KernelQueryPort {
  private final JdbcTemplate jdbc;

  public KernelQueryAdapter(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public boolean objectExists(UUID workspaceId, UUID objectId) {
    return exists(
        "SELECT EXISTS(SELECT 1 FROM data_object WHERE workspace_id = ? AND id = ?)",
        workspaceId,
        objectId);
  }

  @Override
  public boolean relationExists(UUID workspaceId, UUID relationId) {
    return exists(
        "SELECT EXISTS(SELECT 1 FROM data_relation WHERE workspace_id = ? AND id = ?)",
        workspaceId,
        relationId);
  }

  @Override
  public boolean fieldDefExistsForObject(UUID workspaceId, UUID objectId, String fieldCode) {
    return exists(
        """
        SELECT EXISTS(
          SELECT 1 FROM data_object value
          JOIN field_def definition ON definition.object_type_id = value.object_type_id
          WHERE value.workspace_id = ? AND value.id = ? AND definition.code = ?)
        """,
        workspaceId,
        objectId,
        fieldCode);
  }

  private boolean exists(String sql, Object... arguments) {
    return Boolean.TRUE.equals(jdbc.queryForObject(sql, Boolean.class, arguments));
  }
}
