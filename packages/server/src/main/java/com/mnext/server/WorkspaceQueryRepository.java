package com.mnext.server;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class WorkspaceQueryRepository {
  private final JdbcTemplate jdbc;

  WorkspaceQueryRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  List<WorkspaceSummaryView> visibleWorkspaces(String actorId) {
    try {
      var actor = actorId == null || actorId.isBlank() ? null : UUID.fromString(actorId);
      if (actor == null) return allWorkspaces();
      return visibleWorkspacesFor(actor);
    } catch (RuntimeException failure) {
      return allWorkspaces();
    }
  }

  private List<WorkspaceSummaryView> visibleWorkspacesFor(UUID actor) {
    return jdbc.query(
        """
        SELECT w.id, w.name, template.code AS template_code,
               COALESCE(MAX(rm.updated_at), w.created_at) AS updated_at
        FROM workspace w
        LEFT JOIN scene_template template ON template.id = w.template_id
        LEFT JOIN rm_object rm ON rm.workspace_id = w.id
        WHERE NOT EXISTS (
          SELECT 1 FROM workspace_member member WHERE member.workspace_id = w.id
        )
        OR EXISTS (
          SELECT 1 FROM workspace_member member
          WHERE member.workspace_id = w.id AND member.user_id = ?
        )
        GROUP BY w.id, w.name, template.code, w.created_at
        ORDER BY updated_at DESC, w.name ASC
        """,
        (row, index) ->
            workspace(
                row.getObject("id", UUID.class),
                row.getString("name"),
                row.getString("template_code"),
                instant(row.getTimestamp("updated_at"))),
        actor);
  }

  private List<WorkspaceSummaryView> allWorkspaces() {
    return jdbc.query(
        """
        SELECT w.id, w.name, template.code AS template_code,
               COALESCE(MAX(rm.updated_at), w.created_at) AS updated_at
        FROM workspace w
        LEFT JOIN scene_template template ON template.id = w.template_id
        LEFT JOIN rm_object rm ON rm.workspace_id = w.id
        GROUP BY w.id, w.name, template.code, w.created_at
        ORDER BY updated_at DESC, w.name ASC
        """,
        (row, index) ->
            workspace(
                row.getObject("id", UUID.class),
                row.getString("name"),
                row.getString("template_code"),
                instant(row.getTimestamp("updated_at"))));
  }

  private WorkspaceSummaryView workspace(
      UUID workspaceId, String name, String templateCode, Instant updatedAt) {
    return new WorkspaceSummaryView(
        workspaceId, name, templateCode, updatedAt, profiles(workspaceId));
  }

  private List<WorkspaceProfileView> profiles(UUID workspaceId) {
    return jdbc.query(
        """
        SELECT version.id AS template_version_id, template.code AS template_code,
               template.name, version.version, profile.applied_at
        FROM workspace_profile profile
        JOIN scene_template_version version ON version.id = profile.template_version_id
        JOIN scene_template template ON template.id = version.template_id
        WHERE profile.workspace_id = ?
        ORDER BY profile.applied_at, template.code
        """,
        (row, index) ->
            new WorkspaceProfileView(
                row.getObject("template_version_id", UUID.class),
                row.getString("template_code"),
                row.getString("name"),
                row.getInt("version"),
                instant(row.getTimestamp("applied_at"))),
        workspaceId);
  }

  private static Instant instant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
