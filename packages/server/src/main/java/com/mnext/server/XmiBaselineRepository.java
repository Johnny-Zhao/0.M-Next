package com.mnext.server;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class XmiBaselineRepository {
  private final JdbcTemplate jdbc;

  XmiBaselineRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  void refresh(UUID workspaceId, String projectRef, String content) {
    var now = Timestamp.from(Instant.now());
    jdbc.update(
        """
        INSERT INTO xmi_baseline_document
          (workspace_id, project_ref, content, content_hash, version, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT (workspace_id, project_ref)
        DO UPDATE SET content = EXCLUDED.content,
                      content_hash = EXCLUDED.content_hash,
                      version = xmi_baseline_document.version + 1,
                      updated_at = EXCLUDED.updated_at
        """,
        workspaceId,
        projectRef,
        content,
        sha256(content),
        now);
  }

  XmiBaselineDocument get(UUID workspaceId, String projectRef) {
    var rows =
        jdbc.query(
            """
            SELECT content, content_hash, version, updated_at
            FROM xmi_baseline_document
            WHERE workspace_id = ? AND project_ref = ?
            """,
            (row, index) ->
                new XmiBaselineDocument(
                    row.getString("content"),
                    row.getString("content_hash"),
                    row.getInt("version"),
                    row.getTimestamp("updated_at").toInstant()),
            workspaceId,
            projectRef);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private static String sha256(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }

  record XmiBaselineDocument(String content, String contentHash, int version, Instant updatedAt) {}
}
