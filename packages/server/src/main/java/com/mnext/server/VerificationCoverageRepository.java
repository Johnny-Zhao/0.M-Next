package com.mnext.server;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class VerificationCoverageRepository {
  private static final String STATUS_CTE =
      """
      WITH requirements AS (
        SELECT object_id, fields->>'code' AS code, fields->>'text' AS text
        FROM rm_object
        WHERE workspace_id = ? AND object_type_code = 'requirement'
      ),
      latest_run AS (
        SELECT result.run_id
        FROM check_result result
        JOIN requirements requirement ON requirement.object_id = result.object_id
        WHERE result.workspace_id = ?
        GROUP BY result.run_id
        ORDER BY max(result.created_at) DESC, result.run_id
        LIMIT 1
      ),
      flags AS (
        SELECT
          requirement.object_id,
          bool_or(result.rule_code IN ('R-VER-02', 'R-VER-04')) AS failed,
          bool_or(result.rule_code IN ('R-VER-01', 'R-VER-03')) AS unverified,
          string_agg(DISTINCT result.message, '; ' ORDER BY result.message) AS reason
        FROM requirements requirement
        LEFT JOIN latest_run ON TRUE
        LEFT JOIN check_result result
          ON result.workspace_id = ?
         AND result.run_id = latest_run.run_id
         AND result.object_id = requirement.object_id
         AND result.rule_code IN ('R-VER-01', 'R-VER-02', 'R-VER-03', 'R-VER-04')
        GROUP BY requirement.object_id
      ),
      classified AS (
        SELECT
          requirement.object_id AS requirement_id,
          requirement.code,
          requirement.text,
          CASE
            WHEN COALESCE(flags.failed, false) THEN 'failed'
            WHEN COALESCE(flags.unverified, false) THEN 'unverified'
            ELSE 'verified'
          END AS status,
          COALESCE(flags.reason, '') AS reason
        FROM requirements requirement
        JOIN flags ON flags.object_id = requirement.object_id
      )
      """;

  private final JdbcTemplate jdbc;

  VerificationCoverageRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  VerificationCoverageView coverage(UUID workspaceId, int page, int size) {
    var counts =
        jdbc.query(
            STATUS_CTE
                + """
            SELECT
              count(*) FILTER (WHERE status = 'verified') AS verified,
              count(*) FILTER (WHERE status = 'unverified') AS unverified,
              count(*) FILTER (WHERE status = 'failed') AS failed,
              count(*) AS total
            FROM classified
            """,
            rows ->
                rows.next()
                    ? new CoverageCounts(
                        rows.getLong("verified"),
                        rows.getLong("unverified"),
                        rows.getLong("failed"),
                        rows.getLong("total"))
                    : new CoverageCounts(0, 0, 0, 0),
            workspaceId,
            workspaceId,
            workspaceId);
    var gapTotal =
        jdbc.queryForObject(
            STATUS_CTE
                + """
            SELECT count(*)
            FROM classified
            WHERE status IN ('unverified', 'failed')
            """,
            Long.class,
            workspaceId,
            workspaceId,
            workspaceId);
    var gaps =
        jdbc.query(
            STATUS_CTE
                + """
            SELECT requirement_id, code, text, status, reason
            FROM classified
            WHERE status IN ('unverified', 'failed')
            ORDER BY status, code, requirement_id
            LIMIT ? OFFSET ?
            """,
            (row, ignored) ->
                new VerificationGapView(
                    row.getObject("requirement_id", UUID.class),
                    row.getString("code"),
                    row.getString("text"),
                    row.getString("status"),
                    row.getString("reason")),
            workspaceId,
            workspaceId,
            workspaceId,
            size,
            page * size);
    return new VerificationCoverageView(
        counts.verified(),
        counts.unverified(),
        counts.failed(),
        counts.total(),
        new PageView<>(gaps, page, size, gapTotal == null ? 0 : gapTotal));
  }

  private record CoverageCounts(long verified, long unverified, long failed, long total) {}
}
