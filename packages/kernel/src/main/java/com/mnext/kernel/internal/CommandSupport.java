package com.mnext.kernel.internal;

import com.github.f4b6a3.ulid.UlidCreator;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

final class CommandSupport {
  private final KernelRepository repository;

  CommandSupport(KernelRepository repository) {
    this.repository = repository;
  }

  void validateEnvelope(UUID workspaceId, UUID correlationId, String idempotencyKey) {
    if (workspaceId == null || correlationId == null) {
      throw CommandErrors.schema("workspaceId 与 correlationId 必填");
    }
    if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128) {
      throw CommandErrors.schema("idempotencyKey 长度必须为 1..128");
    }
    if (!repository.workspaceWritable(workspaceId)) {
      throw CommandErrors.workspaceNotFound();
    }
  }

  Optional<CommandResult> replay(UUID workspaceId, String key, String payloadHash) {
    var stored = repository.findCommand(workspaceId, key);
    if (stored.isEmpty()) return Optional.empty();
    if (!stored.get().payloadHash().equals(payloadHash)) {
      throw CommandErrors.idempotency(stored.get().commandId());
    }
    return Optional.of(
        new CommandResult(
            stored.get().commandId(),
            CommandStatus.COMMITTED,
            true,
            stored.get().eventIds(),
            null));
  }

  CommandResult commit(
      UUID workspaceId,
      String key,
      String commandId,
      String commandType,
      String payloadHash,
      List<String> eventIds,
      Instant now) {
    repository.insertCommand(workspaceId, key, commandId, commandType, payloadHash, eventIds, now);
    return new CommandResult(commandId, CommandStatus.COMMITTED, false, eventIds, null);
  }

  static String commandId() {
    return UlidCreator.getUlid().toString();
  }

  static String payloadHash(Map<String, Object> payload) {
    return Hashing.sha256(JsonCodec.encode(payload));
  }

  static String eventSource(String sourceType) {
    return switch (sourceType) {
      case "manual", "rule", "AI", "artifact_sync" -> sourceType;
      default -> "system";
    };
  }
}
