package com.mnext.server;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class AiChangeProjection {
  private final JdbcTemplate jdbc;

  AiChangeProjection(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  void projectProposed(UUID setId) {
    jdbc.update(
        """
        INSERT INTO rm_ai_change_set
          (id, workspace_id, action, status, created_by, provider, provider_version,
           context_hash, result_text, created_at, updated_at)
        SELECT id, workspace_id, action, status, created_by, provider, provider_version,
               context_hash, result_text, created_at, updated_at
        FROM ai_change_set WHERE id = ?
        ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            result_text = EXCLUDED.result_text,
            updated_at = EXCLUDED.updated_at
        """,
        setId);
    jdbc.update("DELETE FROM rm_ai_change_item WHERE set_id = ?", setId);
    jdbc.update(
        """
        INSERT INTO rm_ai_change_item
          (id, set_id, seq, op_type, payload, precheck, item_status)
        SELECT id, set_id, seq, op_type, payload, precheck, item_status
        FROM ai_change_item WHERE set_id = ? ORDER BY seq
        """,
        setId);
  }

  void projectRejected(UUID setId) {
    jdbc.update(
        """
        UPDATE rm_ai_change_set readmodel
        SET status = source.status, updated_at = source.updated_at
        FROM ai_change_set source
        WHERE readmodel.id = source.id AND source.id = ?
        """,
        setId);
    jdbc.update(
        """
        UPDATE rm_ai_change_item readmodel
        SET item_status = source.item_status
        FROM ai_change_item source
        WHERE readmodel.id = source.id AND source.set_id = ?
        """,
        setId);
  }
}
