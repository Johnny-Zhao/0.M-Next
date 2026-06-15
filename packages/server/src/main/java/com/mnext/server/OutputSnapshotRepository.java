package com.mnext.server;

import com.mnext.engines.output.OutputTemplate;
import com.mnext.engines.output.RenderRegistry;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class OutputSnapshotRepository {
  private final JdbcTemplate jdbc;
  private final SnapshotRepository snapshots;
  private final RenderRegistry renderers = new RenderRegistry();

  OutputSnapshotRepository(JdbcTemplate jdbc, SnapshotRepository snapshots) {
    this.jdbc = jdbc;
    this.snapshots = snapshots;
  }

  OutputMeta create(UUID workspaceId, OutputCreateRequest request, String actor) {
    if (request == null || request.snapshotId() == null)
      throw new IllegalArgumentException("snapshotId 必填");
    if (request.workspaceId() != null) throw new IllegalArgumentException("输出渲染只接受 snapshotId");
    if (request.format() == null || request.format().isBlank())
      throw new IllegalArgumentException("format 必填");
    var snapshot = snapshots.get(workspaceId, request.snapshotId());
    var renderer = renderers.require(request.format());
    var artifact =
        renderer.render(
            snapshot.payload(), new OutputTemplate(request.objectType(), request.fieldOrder()));
    var id = UUID.randomUUID();
    var createdAt = Instant.now();
    var hash = hash(artifact);
    jdbc.update(
        """
        INSERT INTO output_snapshot
          (output_id, workspace_id, data_snapshot_id, format, template_id, template_version,
           review_status, check_status, data_version, created_at, created_by, content_hash, artifact)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        workspaceId,
        snapshot.meta().snapshotId(),
        request.format(),
        request.templateId(),
        request.templateVersion(),
        "UNKNOWN",
        "UNKNOWN",
        snapshot.meta().dataVersion(),
        java.sql.Timestamp.from(createdAt),
        actor,
        hash,
        artifact);
    return new OutputMeta(
        id,
        snapshot.meta().snapshotId(),
        request.format(),
        request.templateId(),
        request.templateVersion(),
        "UNKNOWN",
        "UNKNOWN",
        snapshot.meta().dataVersion(),
        createdAt,
        actor,
        hash);
  }

  OutputDetail get(UUID workspaceId, UUID outputId) {
    var detail =
        jdbc.query(
            """
            SELECT output_id, data_snapshot_id, format, template_id, template_version,
                   review_status, check_status, data_version, created_at, created_by,
                   content_hash, artifact
            FROM output_snapshot WHERE workspace_id = ? AND output_id = ?
            """,
            result -> result.next() ? detail(result) : null,
            workspaceId,
            outputId);
    if (detail == null) throw new IllegalArgumentException("输出不存在或不可见");
    return detail;
  }

  PageView<OutputMeta> list(UUID workspaceId, int page, int size) {
    var total =
        jdbc.queryForObject(
            "SELECT count(*) FROM output_snapshot WHERE workspace_id = ?", Long.class, workspaceId);
    var items =
        jdbc.query(
            """
            SELECT output_id, data_snapshot_id, format, template_id, template_version,
                   review_status, check_status, data_version, created_at, created_by,
                   content_hash
            FROM output_snapshot WHERE workspace_id = ?
            ORDER BY created_at DESC, output_id LIMIT ? OFFSET ?
            """,
            (row, index) -> meta(row),
            workspaceId,
            size,
            page * size);
    return new PageView<>(items, page, size, total);
  }

  private OutputDetail detail(java.sql.ResultSet row) throws java.sql.SQLException {
    return new OutputDetail(meta(row), row.getBytes(12));
  }

  private OutputMeta meta(java.sql.ResultSet row) throws java.sql.SQLException {
    return new OutputMeta(
        row.getObject(1, UUID.class),
        row.getObject(2, UUID.class),
        row.getString(3),
        row.getObject(4, UUID.class),
        row.getObject(5, Integer.class),
        row.getString(6),
        row.getString(7),
        row.getLong(8),
        row.getTimestamp(9).toInstant(),
        row.getString(10),
        row.getString(11));
  }

  private static String hash(byte[] artifact) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(artifact));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }
}
