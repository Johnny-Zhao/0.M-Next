package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.mnext.engines.review.AnnotationView;
import com.mnext.engines.review.CreateAnnotationCommand;
import com.mnext.engines.review.CreateAnnotationHandler;
import com.mnext.engines.review.ReopenAnnotationCommand;
import com.mnext.engines.review.ReopenAnnotationHandler;
import com.mnext.engines.review.ResolveAnnotationCommand;
import com.mnext.engines.review.ResolveAnnotationHandler;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReviewCommandController {
  private final CreateAnnotationHandler create;
  private final ResolveAnnotationHandler resolve;
  private final ReopenAnnotationHandler reopen;
  private final WorkspaceAuthorizer authorizer;

  public ReviewCommandController(
      CreateAnnotationHandler create,
      ResolveAnnotationHandler resolve,
      ReopenAnnotationHandler reopen,
      WorkspaceAuthorizer authorizer) {
    this.create = create;
    this.resolve = resolve;
    this.reopen = reopen;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/review/commands")
  public AnnotationView execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.REVIEW);
    if (!workspaceId.equals(request.workspaceId())) throw schema("path workspaceId 与命令信封不一致");
    var actor = Actor.user(actorId);
    return switch (request.commandType()) {
      case "CreateAnnotation" -> create.execute(createCommand(request), actor);
      case "ResolveAnnotation" -> resolve.execute(resolveCommand(request), actor);
      case "ReopenAnnotation" -> reopen.execute(reopenCommand(request), actor);
      default -> throw schema("本批次不支持 commandType: " + request.commandType());
    };
  }

  private static CreateAnnotationCommand createCommand(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new CreateAnnotationCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        text(payload, "targetType"),
        uuid(payload, "targetId"),
        optionalText(payload, "fieldCode"),
        required(payload.get("anchoredDataVersion"), "anchoredDataVersion").asLong(),
        text(payload, "severity"),
        text(payload, "body"),
        optionalUuid(payload, "roundId"));
  }

  private static ResolveAnnotationCommand resolveCommand(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new ResolveAnnotationCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "annotationId"),
        optionalText(payload, "comment"));
  }

  private static ReopenAnnotationCommand reopenCommand(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new ReopenAnnotationCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "annotationId"),
        optionalText(payload, "comment"));
  }

  private static UUID uuid(JsonNode payload, String name) {
    return UUID.fromString(text(payload, name));
  }

  private static UUID optionalUuid(JsonNode payload, String name) {
    return payload.has(name) && !payload.get(name).isNull() ? uuid(payload, name) : null;
  }

  private static String text(JsonNode payload, String name) {
    return required(payload.get(name), name).asText();
  }

  private static String optionalText(JsonNode payload, String name) {
    return payload.has(name) && !payload.get(name).isNull() ? payload.get(name).asText() : null;
  }

  private static JsonNode required(JsonNode value, String name) {
    if (value == null || value.isNull()) throw schema(name + " 必填");
    return value;
  }

  private static CommandRejectedException schema(String message) {
    return new CommandRejectedException(
        new CommandError("REVIEW-400-SCHEMA-INVALID", message, Map.of(), "按评审命令 Schema 修正载荷后重试"));
  }
}
