package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.server.ai.AiActionProvider;
import com.mnext.server.ai.AiContext;
import com.mnext.server.ai.AiContextAssembler;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AiCommandController {
  private final AiContextAssembler assembler;
  private final AiActionProvider provider;
  private final AiChangeRepository repository;
  private final WorkspaceAuthorizer authorizer;

  public AiCommandController(
      AiContextAssembler assembler,
      AiActionProvider provider,
      AiChangeRepository repository,
      WorkspaceAuthorizer authorizer) {
    this.assembler = assembler;
    this.provider = provider;
    this.repository = repository;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/ai-commands")
  public CommandResult execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    if (!workspaceId.equals(request.workspaceId())) throw schema("path workspaceId 与命令信封不一致");
    return switch (request.commandType()) {
      case "ProposeAiChange" -> propose(workspaceId, actorId, request);
      case "RejectAiChange" -> reject(workspaceId, actorId, request);
      default -> throw schema("本批次不支持 commandType: " + request.commandType());
    };
  }

  private CommandResult propose(UUID workspaceId, String actorId, CommandRequest request) {
    var parsed = proposeRequest(request);
    var action = action(parsed.action());
    authorizer.require(
        actorId,
        workspaceId,
        action == AiActionProvider.AiAction.EXPLAIN_CHECK
            ? WorkspaceAuthorizer.Action.READ
            : WorkspaceAuthorizer.Action.WRITE_DATA);
    var payloadHash = repository.payloadHash(request);
    var replay = repository.replay(workspaceId, parsed.idempotencyKey(), payloadHash);
    if (replay != null) return replay;
    var selection =
        new AiContext.SelectionCtx(
            parsed.selection() == null ? List.of() : empty(parsed.selection().objectIds()),
            parsed.selection() == null ? List.of() : empty(parsed.selection().checkResultIds()));
    var context =
        assembler.assemble(
            workspaceId,
            actorId,
            selection,
            parsed.action(),
            parsed.instruction(),
            provider.descriptor());
    var result = providerResult(action, context);
    return repository.propose(parsed, actorId, provider.descriptor(), context, result, payloadHash);
  }

  private AiActionProvider.AiResult providerResult(
      AiActionProvider.AiAction action, AiContext context) {
    try {
      return provider.execute(action, context);
    } catch (RuntimeException failure) {
      throw new CommandRejectedException(
          new CommandError(
              "AI-422-PROVIDER-FAILED",
              "AI Provider 执行失败",
              Map.of("provider", provider.descriptor().providerId()),
              "稍后重试或切换 Provider"));
    }
  }

  private CommandResult reject(UUID workspaceId, String actorId, CommandRequest request) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    var parsed = rejectRequest(request);
    var payloadHash = repository.payloadHash(request);
    var replay = repository.replay(workspaceId, parsed.idempotencyKey(), payloadHash);
    if (replay != null) return replay;
    return repository.reject(parsed, actorId, payloadHash);
  }

  private static AiActionRequest proposeRequest(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new AiActionRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        text(payload, "action"),
        selection(payload.get("selection")),
        optionalText(payload, "instruction"));
  }

  private static RejectAiChangeRequest rejectRequest(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new RejectAiChangeRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        UUID.fromString(text(payload, "setId")));
  }

  private static AiSelectionRequest selection(JsonNode node) {
    if (node == null || node.isNull()) return new AiSelectionRequest(List.of(), List.of());
    return new AiSelectionRequest(uuids(node.get("objectIds")), uuids(node.get("checkResultIds")));
  }

  private static List<UUID> uuids(JsonNode node) {
    if (node == null || node.isNull()) return List.of();
    var values = new java.util.ArrayList<UUID>();
    for (var value : node) values.add(UUID.fromString(value.asText()));
    return List.copyOf(values);
  }

  private static AiActionProvider.AiAction action(String value) {
    try {
      return AiActionProvider.AiAction.valueOf(value);
    } catch (IllegalArgumentException failure) {
      throw schema("action 仅支持 SUGGEST_FIELDS 或 EXPLAIN_CHECK");
    }
  }

  private static List<UUID> empty(List<UUID> values) {
    return values == null ? List.of() : values;
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
        new CommandError("AI-400-SCHEMA-INVALID", message, Map.of(), "按 AI 命令 Schema 修正载荷后重试"));
  }
}
