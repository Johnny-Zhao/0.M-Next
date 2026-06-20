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
public class RbacCommandController {
  private final RbacRepository rbac;
  private final WorkspaceAuthorizer authorizer;

  public RbacCommandController(RbacRepository rbac, WorkspaceAuthorizer authorizer) {
    this.rbac = rbac;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/rbac-commands")
  public CommandResult execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody RbacCommandRequest request) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.GOVERN);
    if (!workspaceId.equals(request.workspaceId())) throw schema("path workspaceId 与命令信封不一致");
    return switch (request.commandType()) {
      case "GrantWorkspaceRole" -> rbac.grant(grant(request), actorId);
      case "RevokeWorkspaceRole" -> rbac.revoke(revoke(request));
      default -> throw schema("本批次不支持 commandType: " + request.commandType());
    };
  }

  private static GrantWorkspaceRoleRequest grant(RbacCommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new GrantWorkspaceRoleRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "userId"),
        text(payload, "role"));
  }

  private static RevokeWorkspaceRoleRequest revoke(RbacCommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new RevokeWorkspaceRoleRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "userId"));
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
        new CommandError("RBAC-400-SCHEMA-INVALID", message, Map.of(), "按 RBAC 命令 Schema 修正载荷后重试"));
  }
}
