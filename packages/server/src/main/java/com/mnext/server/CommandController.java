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
import com.mnext.kernel.api.commands.FieldUpdate;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
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
      @PathVariable UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    if (!workspaceId.equals(request.workspaceId())) {
      throw schema("path workspaceId 与命令信封不一致");
    }
    return switch (request.commandType()) {
      case "CreateObject" -> commands.createObject(create(request), Actor.user(actorId));
      case "UpdateFields" -> commands.updateFields(update(request), Actor.user(actorId));
      default -> throw schema("本批次不支持 commandType: " + request.commandType());
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
}
