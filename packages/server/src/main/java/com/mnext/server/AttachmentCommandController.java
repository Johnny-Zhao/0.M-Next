package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AttachmentCommandController {
  private final AttachmentRepository attachments;

  public AttachmentCommandController(AttachmentRepository attachments) {
    this.attachments = attachments;
  }

  @PostMapping("/workspaces/{workspaceId}/attachment-commands")
  public CommandResult execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    if (!workspaceId.equals(request.workspaceId())) throw schema("path workspaceId 与命令信封不一致");
    return switch (request.commandType()) {
      case "AttachFile" -> attachments.attach(attachFile(request), actorId);
      case "DetachFile" -> attachments.detach(detachFile(request), actorId);
      default -> throw schema("本批次不支持 commandType: " + request.commandType());
    };
  }

  private static AttachFileRequest attachFile(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new AttachFileRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "objectId"),
        text(payload, "filename"),
        text(payload, "contentType"),
        required(payload.get("sizeBytes"), "sizeBytes").asLong(),
        text(payload, "sha256"),
        text(payload, "storageKey"));
  }

  private static DetachFileRequest detachFile(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DetachFileRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "attachmentId"));
  }

  private static UUID uuid(JsonNode payload, String name) {
    return UUID.fromString(text(payload, name));
  }

  private static String text(JsonNode payload, String name) {
    return required(payload.get(name), name).asText();
  }

  private static JsonNode required(JsonNode value, String name) {
    if (value == null || value.isNull()) throw schema(name + " 必填");
    return value;
  }

  private static CommandRejectedException schema(String message) {
    return new CommandRejectedException(
        new CommandError("ATT-400-SCHEMA-INVALID", message, Map.of(), "按附件命令 Schema 修正载荷"));
  }
}
