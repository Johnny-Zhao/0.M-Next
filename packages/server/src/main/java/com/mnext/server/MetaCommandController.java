package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MetaCommandController {
  private final MetaCommandService commands;
  private final ObjectMapper mapper;

  public MetaCommandController(MetaCommandService commands, ObjectMapper mapper) {
    this.commands = commands;
    this.mapper = mapper;
  }

  @PostMapping("/workspaces/{workspaceId}/meta-commands")
  public CommandResult execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    if (!workspaceId.equals(request.workspaceId())) throw schema("path workspaceId 与命令信封不一致");
    return switch (request.commandType()) {
      case "DefineObjectType" ->
          commands.defineObjectType(objectType(request), Actor.user(actorId));
      case "DefineFieldDef" -> commands.defineFieldDef(fieldDef(request), Actor.user(actorId));
      case "DefineRelationType" ->
          commands.defineRelationType(relationType(request), Actor.user(actorId));
      default -> throw schema("本批次不支持 commandType: " + request.commandType());
    };
  }

  private DefineObjectTypeCommand objectType(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DefineObjectTypeCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        optionalUuid(payload, "templateVersionId"),
        text(payload, "code"),
        text(payload, "name"));
  }

  private DefineFieldDefCommand fieldDef(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DefineFieldDefCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "objectTypeId"),
        text(payload, "code"),
        text(payload, "name"),
        dataType(payload),
        payload.has("required") && payload.get("required").asBoolean(),
        constraints(payload));
  }

  private DefineRelationTypeCommand relationType(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DefineRelationTypeCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        text(payload, "code"),
        payload.has("name") ? payload.get("name").asText() : null,
        uuid(payload, "sourceTypeId"),
        uuid(payload, "targetTypeId"),
        text(payload, "direction"),
        text(payload, "cardinality"),
        text(payload, "semantics"),
        payload.has("hierarchical") && payload.get("hierarchical").asBoolean());
  }

  private DataType dataType(JsonNode payload) {
    try {
      return DataType.fromCode(text(payload, "dataType"));
    } catch (IllegalArgumentException error) {
      throw schema(error.getMessage());
    }
  }

  private FieldConstraints constraints(JsonNode payload) {
    return payload.has("constraints")
        ? mapper.convertValue(payload.get("constraints"), FieldConstraints.class)
        : FieldConstraints.empty();
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

  private static JsonNode required(JsonNode value, String name) {
    if (value == null || value.isNull()) throw schema(name + " 必填");
    return value;
  }

  private static CommandRejectedException schema(String message) {
    return new CommandRejectedException(
        new CommandError("KERNEL-400-SCHEMA-INVALID", message, Map.of(), "按命令 Schema 修正载荷后重试"));
  }
}
