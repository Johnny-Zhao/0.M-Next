package com.mnext.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.MetaCommandService;
import com.mnext.kernel.api.metamodel.ApplyProfileCommand;
import com.mnext.kernel.api.metamodel.ApplyTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.CreateTemplateCommand;
import com.mnext.kernel.api.metamodel.CreateTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.DefineFieldDefCommand;
import com.mnext.kernel.api.metamodel.DefineObjectTypeCommand;
import com.mnext.kernel.api.metamodel.DefineRelationTypeCommand;
import com.mnext.kernel.api.metamodel.DefineValueTypeCommand;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import com.mnext.kernel.api.metamodel.InstantiateWorkspaceCommand;
import com.mnext.kernel.api.metamodel.PublishTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.RestoreTemplateVersionCommand;
import com.mnext.kernel.api.metamodel.WithdrawTemplateVersionCommand;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MetaCommandController {
  private final MetaCommandService commands;
  private final TemplateLifecycleService lifecycle;
  private final DerivedFieldRepository derivedFields;
  private final TransformationRepository transformations;
  private final TransformationRunner transformationRunner;
  private final ObjectMapper mapper;
  private final WorkspaceAuthorizer authorizer;

  @Autowired
  public MetaCommandController(
      MetaCommandService commands,
      TemplateLifecycleService lifecycle,
      DerivedFieldRepository derivedFields,
      TransformationRepository transformations,
      TransformationRunner transformationRunner,
      ObjectMapper mapper,
      WorkspaceAuthorizer authorizer) {
    this.commands = commands;
    this.lifecycle = lifecycle;
    this.derivedFields = derivedFields;
    this.transformations = transformations;
    this.transformationRunner = transformationRunner;
    this.mapper = mapper;
    this.authorizer = authorizer;
  }

  MetaCommandController(
      MetaCommandService commands,
      TemplateLifecycleService lifecycle,
      DerivedFieldRepository derivedFields,
      ObjectMapper mapper) {
    this(commands, lifecycle, derivedFields, null, null, mapper, null);
  }

  @PostMapping("/workspaces/{workspaceId}/meta-commands")
  public CommandResult execute(
      @PathVariable("workspaceId") UUID workspaceId,
      @RequestHeader("X-Actor-Id") String actorId,
      @RequestBody CommandRequest request) {
    if (authorizer != null) {
      authorizer.require(actorId, workspaceId, WorkspaceAuthorizer.Action.GOVERN);
    }
    if (!workspaceId.equals(request.workspaceId())) throw schema("path workspaceId 与命令信封不一致");
    return switch (request.commandType()) {
      case "CreateTemplate" ->
          commands.createTemplate(createTemplate(request), Actor.user(actorId));
      case "CreateTemplateVersion" ->
          commands.createTemplateVersion(createTemplateVersion(request), Actor.user(actorId));
      case "DefineObjectType" ->
          commands.defineObjectType(objectType(request), Actor.user(actorId));
      case "DefineFieldDef" -> commands.defineFieldDef(fieldDef(request), Actor.user(actorId));
      case "DefineRelationType" ->
          commands.defineRelationType(relationType(request), Actor.user(actorId));
      case "DefineValueType" -> commands.defineValueType(valueType(request), Actor.user(actorId));
      case "PublishTemplateVersion" ->
          commands.publishTemplateVersion(publishTemplateVersion(request), Actor.user(actorId));
      case "WithdrawTemplateVersion" ->
          commands.withdrawTemplateVersion(withdrawTemplateVersion(request), Actor.user(actorId));
      case "RestoreTemplateVersion" ->
          commands.restoreTemplateVersion(restoreTemplateVersion(request), Actor.user(actorId));
      case "InstantiateWorkspace" ->
          lifecycle.instantiateWorkspace(instantiateWorkspace(request), Actor.user(actorId));
      case "ApplyProfile" -> lifecycle.applyProfile(applyProfile(request), Actor.user(actorId));
      case "ApplyTemplateVersion" ->
          lifecycle.applyTemplateVersion(applyTemplateVersion(request), Actor.user(actorId));
      case "DefineDerivedField" -> derivedFields.define(derivedField(request), actorId);
      case "DefineTransformation" -> transformations.define(transformation(request), actorId);
      case "RunTransformation" ->
          transformationRunner.run(runTransformation(request), Actor.user(actorId));
      default -> throw schema("本批次不支持 commandType: " + request.commandType());
    };
  }

  private CreateTemplateCommand createTemplate(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new CreateTemplateCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        text(payload, "code"),
        text(payload, "name"));
  }

  private CreateTemplateVersionCommand createTemplateVersion(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new CreateTemplateVersionCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "templateId"));
  }

  private DefineObjectTypeCommand objectType(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DefineObjectTypeCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        optionalUuid(payload, "templateVersionId"),
        text(payload, "code"),
        text(payload, "name"),
        optionalText(payload, "parentTypeCode"));
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
        payload.has("dataType") ? dataType(payload) : null,
        optionalText(payload, "valueTypeCode"),
        payload.has("required") && payload.get("required").asBoolean(),
        constraints(payload));
  }

  private DefineValueTypeCommand valueType(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DefineValueTypeCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        optionalUuid(payload, "templateVersionId"),
        text(payload, "code"),
        text(payload, "name"),
        dataType(payload, "basePrimitive"),
        optionalText(payload, "parentValueTypeCode"),
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
        payload.has("hierarchical") && payload.get("hierarchical").asBoolean(),
        optionalUuid(payload, "templateVersionId"));
  }

  private PublishTemplateVersionCommand publishTemplateVersion(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new PublishTemplateVersionCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "templateVersionId"));
  }

  private WithdrawTemplateVersionCommand withdrawTemplateVersion(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new WithdrawTemplateVersionCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "templateVersionId"));
  }

  private RestoreTemplateVersionCommand restoreTemplateVersion(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new RestoreTemplateVersionCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "templateVersionId"));
  }

  private InstantiateWorkspaceCommand instantiateWorkspace(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new InstantiateWorkspaceCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "templateId"),
        required(payload.get("version"), "version").asInt(),
        uuid(payload, "newWorkspaceId"),
        text(payload, "workspaceName"));
  }

  private ApplyTemplateVersionCommand applyTemplateVersion(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new ApplyTemplateVersionCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        required(payload.get("toVersion"), "toVersion").asInt());
  }

  private ApplyProfileCommand applyProfile(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new ApplyProfileCommand(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        uuid(payload, "templateId"),
        required(payload.get("version"), "version").asInt());
  }

  private DefineDerivedFieldRequest derivedField(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DefineDerivedFieldRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        optionalUuid(payload, "templateVersionId"),
        uuid(payload, "objectTypeId"),
        text(payload, "code"),
        text(payload, "name"),
        text(payload, "resultType"),
        text(payload, "derivation"));
  }

  private DefineTransformationRequest transformation(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new DefineTransformationRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        optionalUuid(payload, "templateVersionId"),
        text(payload, "code"),
        text(payload, "name"),
        text(payload, "correspondenceRelationCode"),
        mapper.convertValue(
            required(payload.get("objectMappings"), "objectMappings"),
            mapper
                .getTypeFactory()
                .constructCollectionType(java.util.List.class, ObjectMapping.class)),
        payload.has("relationMappings")
            ? mapper.convertValue(
                payload.get("relationMappings"),
                mapper
                    .getTypeFactory()
                    .constructCollectionType(java.util.List.class, RelationMapping.class))
            : java.util.List.of());
  }

  private RunTransformationRequest runTransformation(CommandRequest request) {
    var payload = required(request.payload(), "payload");
    return new RunTransformationRequest(
        request.workspaceId(),
        request.correlationId(),
        request.idempotencyKey(),
        text(payload, "transformationCode"));
  }

  private DataType dataType(JsonNode payload) {
    return dataType(payload, "dataType");
  }

  private DataType dataType(JsonNode payload, String name) {
    try {
      return DataType.fromCode(text(payload, name));
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

  private static String optionalText(JsonNode payload, String name) {
    return payload.has(name) && !payload.get(name).isNull() ? payload.get(name).asText() : null;
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
