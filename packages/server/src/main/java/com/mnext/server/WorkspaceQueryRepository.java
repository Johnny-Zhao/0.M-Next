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
        WHERE w.id <> ?
          AND (
            NOT EXISTS (
              SELECT 1 FROM workspace_member member WHERE member.workspace_id = w.id
            )
            OR EXISTS (
              SELECT 1 FROM workspace_member member
              WHERE member.workspace_id = w.id AND member.user_id = ?
            )
        )
        GROUP BY w.id, w.name, template.code, w.created_at
        ORDER BY updated_at DESC, w.name ASC
        """,
        (row, index) ->
            new WorkspaceSummaryView(
                row.getObject("id", UUID.class),
                row.getString("name"),
                row.getString("template_code"),
                instant(row.getTimestamp("updated_at"))),
        ProfileLoader.AUTHOR_WORKSPACE,
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
        WHERE w.id <> ?
        GROUP BY w.id, w.name, template.code, w.created_at
        ORDER BY updated_at DESC, w.name ASC
        """,
        (row, index) ->
            new WorkspaceSummaryView(
                row.getObject("id", UUID.class),
                row.getString("name"),
                row.getString("template_code"),
                instant(row.getTimestamp("updated_at"))),
        ProfileLoader.AUTHOR_WORKSPACE);
  }

  private static Instant instant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
