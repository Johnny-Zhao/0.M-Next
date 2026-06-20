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
public class RuleCommandController {
  private final RuleDefRepository rules;
  private final RuleCheckRunner checks;
  private final WorkspaceAuthorizer authorizer;

  public RuleCommandController(
      RuleDefRepository rules, RuleCheckRunner checks, WorkspaceAuthorizer authorizer) {
    this.rules = rules;
    this.checks = checks;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/rule-commands")
  public CommandResult execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    authorizer.require(actorId, workspaceId, action(request.commandType()));
    if (!workspaceId.equals(request.workspaceId())) throw schema("path workspaceId 与命令信封不一致");
    return switch (request.commandType()) {
      case "DefineRule" -> rules.defineRule(defineRule(request), actorId);
      case "PublishRule" -> rules.publishRule(publishRule(request), actorId);
      case "RunRuleCheck" -> checks.run(runRuleCheck(request));
      default -> throw schema("本批次不支持 commandType: " + request.commandType());
    };
  }

  private static WorkspaceAuthorizer.Action action(String commandType) {
    return "RunRuleCheck".equals(commandType)
        ? WorkspaceAuthorizer.Action.REVIEW
        : WorkspaceAuthorizer.Action.GOVERN;
  }

  private static DefineRuleRequest defineRule(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DefineRuleRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        optionalUuid(payload, "templateVersionId"),
        text(payload, "ruleCode"),
        scope(required(payload.get("scope"), "scope")),
        text(payload, "severity"),
        text(payload, "when"),
        text(payload, "message"),
        optionalNode(payload, "impact"),
        optionalText(payload, "suggest"),
        optionalNode(payload, "fix"),
        required(payload.get("lightweight"), "lightweight").asBoolean());
  }

  private static PublishRuleRequest publishRule(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new PublishRuleRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        text(payload, "ruleCode"));
  }

  private static RunRuleCheckRequest runRuleCheck(CommandRequest request) {
    var payload = request.payload();
    var scope =
        payload != null && payload.has("scope") && !payload.get("scope").isNull()
            ? scope(payload.get("scope"))
            : null;
    return new RunRuleCheckRequest(
        request.workspaceId(), request.correlationId(), request.idempotencyKey(), scope);
  }

  private static RuleScopeRequest scope(JsonNode payload) {
    return new RuleScopeRequest(
        text(payload, "objectTypeCode"), optionalText(payload, "fieldCode"));
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

  private static JsonNode optionalNode(JsonNode payload, String name) {
    return payload.has(name) && !payload.get(name).isNull() ? payload.get(name) : null;
  }

  private static JsonNode required(JsonNode value, String name) {
    if (value == null || value.isNull()) throw schema(name + " 必填");
    return value;
  }

  private static CommandRejectedException schema(String message) {
    return new CommandRejectedException(
        new CommandError("RULE-400-SCHEMA-INVALID", message, Map.of(), "按规则命令 Schema 修正载荷后重试"));
  }
}
