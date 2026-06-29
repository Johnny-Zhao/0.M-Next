package com.mnext.server;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AssemblyCommandController {
  private final ReusableAssemblyRunner runner;
  private final ObjectMapper mapper;
  private final WorkspaceAuthorizer authorizer;

  AssemblyCommandController(
      ReusableAssemblyRunner runner, ObjectMapper mapper, WorkspaceAuthorizer authorizer) {
    this.runner = runner;
    this.mapper = mapper;
    this.authorizer = authorizer;
  }

  @PostMapping("/workspaces/{workspaceId}/assembly-commands")
  public CommandResult execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.WRITE_DATA);
    if (!workspaceId.equals(request.workspaceId())) {
      throw ReusableAssemblyRepository.schema("path workspaceId 与命令信封不一致");
    }
    if (!"PlaceAssembly".equals(request.commandType())) {
      throw ReusableAssemblyRepository.schema("本端点仅支持 commandType: PlaceAssembly");
    }
    return runner.place(placeAssembly(request), Actor.user(actorId));
  }

  private PlaceAssemblyRequest placeAssembly(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new PlaceAssemblyRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "assemblyId"),
        required(payload.get("version"), "version").asLong(),
        text(payload, "placementKey"),
        payload.has("params")
            ? mapper.convertValue(
                payload.get("params"), new TypeReference<Map<String, Object>>() {})
            : Map.of());
  }

  private static UUID uuid(JsonNode payload, String name) {
    return UUID.fromString(text(payload, name));
  }

  private static String text(JsonNode payload, String name) {
    return required(payload.get(name), name).asText();
  }

  private static JsonNode required(JsonNode value, String name) {
    if (value == null || value.isNull()) {
      throw ReusableAssemblyRepository.schema(name + " 必填");
    }
    return value;
  }
}
