package com.mnext.server;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import com.mnext.kernel.api.commands.FieldUpdate;
import com.mnext.kernel.api.commands.UnlinkCommand;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import com.mnext.kernel.api.commands.UpdateRelationCommand;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CommandController {
  private final KernelCommandService commands;
  private final ObjectMapper mapper;

  public CommandController(KernelCommandService commands, ObjectMapper mapper) {
    this.commands = commands;
    this.mapper = mapper;
  }

  @PostMapping("/workspaces/{workspaceId}/commands")
  public CommandResult execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    if (!workspaceId.equals(request.workspaceId())) {
      throw schema("path workspaceId 与命令信封不一致");
    }
    return switch (request.commandType()) {
      case "CreateObject" -> commands.createObject(create(request), Actor.user(actorId));
      case "UpdateFields" -> commands.updateFields(update(request), Actor.user(actorId));
      case "CreateRelation" ->
          commands.createRelation(createRelation(request), Actor.user(actorId));
      case "UpdateRelation" ->
          commands.updateRelation(updateRelation(request), Actor.user(actorId));
      case "Unlink" -> commands.unlink(unlink(request), Actor.user(actorId));
      default -> throw unknownCommand("本批次不支持 commandType: " + request.commandType());
    };
  }

  private CreateObjectCommand create(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    var source = required(payload.get("source"), "source");
    Map<String, Object> fields =
        mapper.convertValue(required(payload.get("fields"), "fields"), new TypeReference<>() {});
    return new CreateObjectCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        UUID.fromString(required(payload.get("objectTypeId"), "objectTypeId").asText()),
        fields,
        new SourceInfo(
            required(source.get("type"), "source.type").asText(), text(source.get("ref"))),
        text(payload.get("initialState")));
  }

  private UpdateFieldsCommand update(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    var updates = new ArrayList<FieldUpdate>();
    for (var field : required(payload.get("fields"), "fields")) {
      updates.add(
          new FieldUpdate(
              required(field.get("fieldDefCode"), "fieldDefCode").asText(),
              mapper.convertValue(field.get("value"), Object.class),
              field.has("expectedFieldVersion")
                  ? field.get("expectedFieldVersion").asLong()
                  : null));
    }
    return new UpdateFieldsCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        UUID.fromString(required(payload.get("objectId"), "objectId").asText()),
        required(payload.get("expectedObjectVersion"), "expectedObjectVersion").asLong(),
        updates);
  }

  private CreateRelationCommand createRelation(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    var source = required(payload.get("source"), "source");
    Map<String, Object> fields =
        payload.has("relationFields")
            ? mapper.convertValue(payload.get("relationFields"), new TypeReference<>() {})
            : Map.of();
    return new CreateRelationCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "relationTypeId"),
        uuid(payload, "sourceId"),
        uuid(payload, "targetId"),
        fields,
        new SourceInfo(
            required(source.get("type"), "source.type").asText(), text(source.get("ref"))));
  }

  private UpdateRelationCommand updateRelation(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    Map<String, Object> fields =
        payload.has("fields")
            ? mapper.convertValue(payload.get("fields"), new TypeReference<>() {})
            : null;
    return new UpdateRelationCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "relationId"),
        required(payload.get("expectedVersion"), "expectedVersion").asLong(),
        fields,
        optionalUuid(payload, "sourceId"),
        optionalUuid(payload, "targetId"));
  }

  private UnlinkCommand unlink(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new UnlinkCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        optionalUuid(payload, "relationId"),
        optionalUuid(payload, "sourceId"),
        optionalUuid(payload, "targetId"),
        optionalUuid(payload, "relationTypeId"),
        required(payload.get("reason"), "reason").asText(),
        required(payload.get("expectedVersion"), "expectedVersion").asLong(),
        payload.has("acknowledgeImpact") && payload.get("acknowledgeImpact").asBoolean());
  }

  private static UUID uuid(JsonNode payload, String name) {
    return UUID.fromString(required(payload.get(name), name).asText());
  }

  private static UUID optionalUuid(JsonNode payload, String name) {
    return payload.has(name) ? UUID.fromString(payload.get(name).asText()) : null;
  }

  private static JsonNode required(JsonNode value, String name) {
    if (value == null || value.isNull()) throw schema(name + " 必填");
    return value;
  }

  private static String text(JsonNode value) {
    return value == null || value.isNull() ? null : value.asText();
  }

  private static CommandRejectedException schema(String message) {
    return new CommandRejectedException(
        new CommandError("KERNEL-400-SCHEMA-INVALID", message, Map.of(), "按命令 Schema 修正载荷后重试"));
  }

  private static CommandRejectedException unknownCommand(String message) {
    return new CommandRejectedException(
        new CommandError("KERNEL-400-UNKNOWN-COMMAND", message, Map.of(), "按命令 Schema 修正载荷后重试"));
  }
}
