package com.mnext.server;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class XmiIdentityRepository {
  private final JdbcTemplate jdbc;

  XmiIdentityRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  void upsert(
      UUID workspaceId,
      String projectRef,
      Map<String, UUID> objectIds,
      Map<String, UUID> relationIds) {
    var rows = new ArrayList<IdentityWrite>();
    objectIds.forEach(
        (xmiId, platformId) -> rows.add(new IdentityWrite(xmiId, "object", platformId)));
    relationIds.forEach(
        (xmiId, platformId) -> rows.add(new IdentityWrite(xmiId, "relation", platformId)));
    if (rows.isEmpty()) return;
    var now = Timestamp.from(Instant.now());
    jdbc.batchUpdate(
        """
        INSERT INTO xmi_identity
          (workspace_id, project_ref, xmi_id, platform_kind, platform_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, project_ref, xmi_id)
        DO UPDATE SET platform_kind = EXCLUDED.platform_kind,
                      platform_id = EXCLUDED.platform_id
        """,
        rows,
        rows.size(),
        (statement, row) -> {
          statement.setObject(1, workspaceId);
          statement.setString(2, projectRef);
          statement.setString(3, row.xmiId());
          statement.setString(4, row.platformKind());
          statement.setObject(5, row.platformId());
          statement.setTimestamp(6, now);
        });
  }

  Map<String, XmiIdentityRecord> identities(UUID workspaceId, String projectRef) {
    var values = new LinkedHashMap<String, XmiIdentityRecord>();
    jdbc.query(
        """
        SELECT xmi_id, platform_kind, platform_id, created_at
        FROM xmi_identity
        WHERE workspace_id = ? AND project_ref = ?
        ORDER BY xmi_id
        """,
        result -> {
          values.put(
              result.getString("xmi_id"),
              new XmiIdentityRecord(
                  result.getString("xmi_id"),
                  result.getString("platform_kind"),
                  result.getObject("platform_id", UUID.class),
                  result.getTimestamp("created_at").toInstant()));
        },
        workspaceId,
        projectRef);
    return values;
  }

  UUID createdRelationId(List<String> eventIds) {
    for (var eventId : eventIds) {
      var value =
          jdbc.query(
              "SELECT aggregate_id FROM event_outbox WHERE id = ? AND aggregate_type = 'relation'",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (value != null) return UUID.fromString(value);
    }
    throw new IllegalStateException("CreateRelation 未产生 RelationCreated 事件");
  }

  private record IdentityWrite(String xmiId, String platformKind, UUID platformId) {}

  record XmiIdentityRecord(String xmiId, String platformKind, UUID platformId, Instant createdAt) {}
}
