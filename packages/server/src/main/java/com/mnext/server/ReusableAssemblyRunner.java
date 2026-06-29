package com.mnext.server;

import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ReusableAssemblyRunner {
  private static final int MAX_OBJECTS = 100;
  private static final int MAX_RELATIONS = 200;

  private final ReusableAssemblyRepository assemblies;
  private final KernelCommandService commands;

  ReusableAssemblyRunner(ReusableAssemblyRepository assemblies, KernelCommandService commands) {
    this.assemblies = assemblies;
    this.commands = commands;
  }

  @Transactional
  CommandResult place(PlaceAssemblyRequest request, Actor actor) {
    validate(request);
    var definition = assemblies.get(request.workspaceId(), request.assemblyId(), request.version());
    var content = definition.content();
    var objects = assemblies.objects(content);
    var relations = assemblies.relations(content);
    if (objects.size() > MAX_OBJECTS || relations.size() > MAX_RELATIONS) {
      throw ReusableAssemblyRepository.schema("assembly content 超过放置上限");
    }
    var ref = "assembly:" + definition.assemblyId() + ":v" + definition.version();
    var params = mergedParams(definition.params(), request.params());
    var objectIds = new LinkedHashMap<String, UUID>();
    var events = new ArrayList<String>();
    var replay = true;
    for (var object : objects) {
      var key = requiredText(object, "key");
      var type = requiredText(object, "objectType");
      var result =
          commands.createObject(
              new CreateObjectCommand(
                  request.workspaceId(),
                  request.correlationId(),
                  childKey(request, "o", key),
                  assemblies.objectTypeId(
                      request.workspaceId(), definition.templateVersionId(), type),
                  resolve(assemblies.fields(object, "fields"), params),
                  new SourceInfo("system", ref),
                  text(object.get("initialState"))),
              actor);
      ensureCommitted(result);
      replay = replay && result.idempotentReplay();
      events.addAll(result.events());
      objectIds.put(key, assemblies.createdObjectId(result.events()));
    }
    var index = 0;
    for (var relation : relations) {
      var key = text(relation.get("key"));
      if (key == null || key.isBlank()) key = String.valueOf(index);
      var result =
          commands.createRelation(
              new CreateRelationCommand(
                  request.workspaceId(),
                  request.correlationId(),
                  childKey(request, "r", key),
                  assemblies.relationTypeId(
                      request.workspaceId(),
                      definition.templateVersionId(),
                      requiredText(relation, "relationType")),
                  objectIds.get(requiredText(relation, "source")),
                  objectIds.get(requiredText(relation, "target")),
                  resolve(assemblies.fields(relation, "fields"), params),
                  new SourceInfo("system", ref)),
              actor);
      ensureCommitted(result);
      replay = replay && result.idempotentReplay();
      events.addAll(result.events());
      index++;
    }
    return new CommandResult(
        "assembly-place:"
            + digest(request.assemblyId() + ":" + request.placementKey()).substring(0, 26),
        CommandStatus.COMMITTED,
        replay,
        List.copyOf(events),
        null);
  }

  private void validate(PlaceAssemblyRequest request) {
    if (request.workspaceId() == null
        || request.correlationId() == null
        || request.assemblyId() == null
        || request.version() < 1
        || request.idempotencyKey() == null
        || request.idempotencyKey().isBlank()
        || request.placementKey() == null
        || request.placementKey().isBlank()) {
      throw ReusableAssemblyRepository.schema(
          "workspaceId、correlationId、idempotencyKey、assemblyId、version、placementKey 必填");
    }
  }

  private static void ensureCommitted(CommandResult result) {
    if (result.status() != CommandStatus.COMMITTED && result.status() != CommandStatus.ACCEPTED) {
      throw ReusableAssemblyRepository.schema("assembly 子命令未提交");
    }
  }

  private static Map<String, Object> mergedParams(
      Map<String, Object> defaults, Map<String, Object> overrides) {
    var result = new LinkedHashMap<String, Object>();
    if (defaults != null) result.putAll(defaults);
    if (overrides != null) result.putAll(overrides);
    return Map.copyOf(result);
  }

  private static Map<String, Object> resolve(
      Map<String, Object> fields, Map<String, Object> params) {
    var result = new LinkedHashMap<String, Object>();
    fields.forEach((key, value) -> result.put(key, resolveValue(value, params)));
    return Map.copyOf(result);
  }

  private static Object resolveValue(Object value, Map<String, Object> params) {
    if (value instanceof String text && text.startsWith("${") && text.endsWith("}")) {
      var key = text.substring(2, text.length() - 1);
      return params.getOrDefault(key, value);
    }
    if (value instanceof Map<?, ?> nested) {
      var result = new LinkedHashMap<String, Object>();
      nested.forEach((key, item) -> result.put(String.valueOf(key), resolveValue(item, params)));
      return Map.copyOf(result);
    }
    if (value instanceof List<?> list)
      return list.stream().map(item -> resolveValue(item, params)).toList();
    return value;
  }

  private static String childKey(PlaceAssemblyRequest request, String kind, String localKey) {
    return "pa:"
        + digest(
            request.assemblyId()
                + ":"
                + request.version()
                + ":"
                + request.placementKey()
                + ":"
                + kind
                + ":"
                + localKey);
  }

  private static String requiredText(Map<String, Object> value, String key) {
    var text = text(value.get(key));
    if (text == null || text.isBlank()) throw ReusableAssemblyRepository.schema(key + " 必填");
    return text;
  }

  private static String text(Object value) {
    return value instanceof String text ? text : null;
  }

  private static String digest(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }
}
