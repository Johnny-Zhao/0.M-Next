package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class RbacRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  RbacRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Transactional
  CommandResult grant(GrantWorkspaceRoleRequest request, String actorId) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    validateRole(request.role());
    if (request.userId() == null) throw schema("userId 必填");
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    var bootstrap = memberCount(request.workspaceId()) == 0;
    if (bootstrap) grantBootstrapAdmin(request.workspaceId(), actorId);
    ensureUser(request.userId());
    upsertMember(request.workspaceId(), request.userId(), request.role(), actorId);
    var result = accepted(commandId(), false, "userId=" + request.userId());
    remember(
        request.workspaceId(),
        request.idempotencyKey(),
        result.commandId(),
        "GrantWorkspaceRole",
        payloadHash,
        result);
    return result;
  }

  @Transactional
  CommandResult revoke(RevokeWorkspaceRoleRequest request) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    if (request.userId() == null) throw schema("userId 必填");
    var payloadHash = hash(json(request));
    var replay = replay(request.workspaceId(), request.idempotencyKey(), payloadHash);
    if (replay != null) return replay.replayed();
    jdbc.update(
        "DELETE FROM workspace_member WHERE workspace_id = ? AND user_id = ?",
        request.workspaceId(),
        request.userId());
    var result = accepted(commandId(), false, "userId=" + request.userId());
    remember(
        request.workspaceId(),
        request.idempotencyKey(),
        result.commandId(),
        "RevokeWorkspaceRole",
        payloadHash,
        result);
    return result;
  }

  List<MemberView> members(UUID workspaceId) {
    return jdbc.query(
        """
        SELECT user_id, role, granted_by, granted_at
        FROM workspace_member
        WHERE workspace_id = ?
        ORDER BY granted_at, user_id
        LIMIT 200
        """,
        (row, index) ->
            new MemberView(
                row.getObject("user_id", UUID.class),
                row.getString("role"),
                row.getString("granted_by"),
                row.getTimestamp("granted_at").toInstant()),
        workspaceId);
  }

  private void grantBootstrapAdmin(UUID workspaceId, String actorId) {
    var actor = actor(actorId);
    ensureUser(actor);
    upsertMember(workspaceId, actor, "ADMIN", actorId);
  }

  private UUID actor(String actorId) {
    try {
      if (actorId == null || actorId.isBlank()) throw new IllegalArgumentException();
      return UUID.fromString(actorId);
    } catch (IllegalArgumentException failure) {
      throw rejected("AUTH-401-UNKNOWN-ACTOR", "操作者不存在或已停用", "使用有效账号重新发起请求");
    }
  }

  private void ensureUser(UUID userId) {
    jdbc.update(
        """
        INSERT INTO app_user (id, display_name, status, created_at)
        VALUES (?, ?, 'ACTIVE', ?)
        ON CONFLICT (id) DO NOTHING
        """,
        userId,
        userId.toString(),
        Timestamp.from(Instant.now()));
  }

  private void upsertMember(UUID workspaceId, UUID userId, String role, String actorId) {
    jdbc.update(
        """
        INSERT INTO workspace_member (workspace_id, user_id, role, granted_by, granted_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET
          role = EXCLUDED.role,
          granted_by = EXCLUDED.granted_by,
          granted_at = EXCLUDED.granted_at
        """,
        workspaceId,
        userId,
        role,
        actorId,
        Timestamp.from(Instant.now()));
  }

  private int memberCount(UUID workspaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM workspace_member WHERE workspace_id = ?", Integer.class, workspaceId);
  }

  private CommandResult replay(UUID workspaceId, String idempotencyKey, String payloadHash) {
    var stored =
        jdbc.query(
            """
            SELECT payload_hash, result_snapshot::text
            FROM command_log WHERE workspace_id = ? AND idempotency_key = ?
            """,
            (row, index) -> new StoredCommand(row.getString(1), row.getString(2)),
            workspaceId,
            idempotencyKey);
    if (stored.isEmpty()) return null;
    var command = stored.getFirst();
    if (!command.payloadHash().equals(payloadHash)) {
      throw rejected("RBAC-409-IDEMPOTENCY-CONFLICT", "幂等键已被不同载荷使用", "更换 idempotencyKey 后重试");
    }
    try {
      return mapper.readValue(command.resultJson(), CommandResult.class);
    } catch (JsonProcessingException failure) {
      throw new IllegalStateException("RBAC 命令结果无法反序列化", failure);
    }
  }

  private void remember(
      UUID workspaceId,
      String idempotencyKey,
      String commandId,
      String commandType,
      String payloadHash,
      CommandResult result) {
    jdbc.update(
        """
        INSERT INTO command_log
          (workspace_id, idempotency_key, command_id, command_type, payload_hash,
           result_snapshot, decided_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        workspaceId,
        idempotencyKey,
        commandId,
        commandType,
        payloadHash,
        json(result),
        Timestamp.from(Instant.now()));
  }

  private void validateEnvelope(UUID workspaceId, String idempotencyKey) {
    if (workspaceId == null) throw schema("workspaceId 必填");
    if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128) {
      throw schema("idempotencyKey 长度必须为 1..128");
    }
  }

  private void validateRole(String role) {
    try {
      WorkspaceAuthorizer.Role.valueOf(role);
    } catch (RuntimeException failure) {
      throw schema("role 必须为 VIEWER、AUTHOR、REVIEWER 或 ADMIN");
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("RBAC 命令 JSON 无法序列化", failure);
    }
  }

  private static CommandResult accepted(String commandId, boolean replay, String event) {
    return new CommandResult(commandId, CommandStatus.COMMITTED, replay, List.of(event), null);
  }

  private static String hash(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }

  private static String commandId() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 26);
  }

  private static CommandRejectedException schema(String message) {
    return rejected("RBAC-400-SCHEMA-INVALID", message, "按 RBAC 命令 Schema 修正载荷后重试");
  }

  private static CommandRejectedException rejected(String code, String message, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, Map.of(), suggestion));
  }

  private record StoredCommand(String payloadHash, String resultJson) {}
}
