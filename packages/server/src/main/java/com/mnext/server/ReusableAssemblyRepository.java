package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class ReusableAssemblyRepository {
  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  ReusableAssemblyRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  CommandResult define(DefineReusableAssemblyRequest request, String actorId) {
    validateDefine(request);
    validateContent(request.workspaceId(), request.templateVersionId(), request.content());
    var params = request.params() == null ? Map.<String, Object>of() : request.params();
    var existing = findByName(request.templateVersionId(), request.name());
    if (existing != null) {
      if (!sameJson(existing.params(), params)
          || !sameJson(existing.content(), request.content())) {
        throw conflict("同 profile 下 reusable assembly name 已存在且定义不同", existing.id());
      }
      return result(existing.id(), true);
    }
    var id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO reusable_assembly
          (assembly_id, name, template_version_id, version, params, content, created_by, created_at)
        VALUES (?, ?, ?, 1, CAST(? AS jsonb), CAST(? AS jsonb), ?, ?)
        """,
        id,
        request.name(),
        request.templateVersionId(),
        json(params),
        json(request.content()),
        actorId,
        Timestamp.from(Instant.now()));
    return result(id, false);
  }

  AssemblyDefinition get(UUID workspaceId, UUID assemblyId, long version) {
    var definition =
        jdbc.query(
            """
            SELECT assembly.assembly_id, assembly.name, assembly.template_version_id,
                   assembly.version, assembly.params::text, assembly.content::text
            FROM reusable_assembly assembly
            JOIN workspace_profile profile
              ON profile.workspace_id = ? AND profile.template_version_id = assembly.template_version_id
            WHERE assembly.assembly_id = ? AND assembly.version = ?
            """,
            result ->
                result.next()
                    ? new AssemblyDefinition(
                        result.getObject(1, UUID.class),
                        result.getString(2),
                        result.getObject(3, UUID.class),
                        result.getLong(4),
                        map(result.getString(5)),
                        map(result.getString(6)))
                    : null,
            workspaceId,
            assemblyId,
            version);
    if (definition == null) throw schema("assemblyId/version 不存在或 profile 未应用到工作空间");
    return definition;
  }

  PageView<ReusableAssemblyView> list(UUID workspaceId, String profile, int page, int size) {
    if (page < 0 || size < 1 || size > 100) {
      throw schema("page 必须非负且 size 必须为 1..100");
    }
    var filter = new StringBuilder();
    var params = new ArrayList<Object>();
    params.add(workspaceId);
    if (profile != null && !profile.isBlank()) {
      filter.append(" AND (template.code = ? OR assembly.template_version_id::text = ?)");
      params.add(profile);
      params.add(profile);
    }
    var total =
        jdbc.queryForObject(
            """
            SELECT count(*)
            FROM reusable_assembly assembly
            JOIN workspace_profile profile
              ON profile.workspace_id = ? AND profile.template_version_id = assembly.template_version_id
            JOIN scene_template_version version ON version.id = assembly.template_version_id
            JOIN scene_template template ON template.id = version.template_id
            """
                + filter,
            Long.class,
            params.toArray());
    params.add(size);
    params.add(page * size);
    var items =
        jdbc.query(
            """
            SELECT assembly.assembly_id, assembly.name, assembly.template_version_id,
                   template.code, version.version, assembly.version, assembly.params::text,
                   assembly.content::text, assembly.created_at
            FROM reusable_assembly assembly
            JOIN workspace_profile profile
              ON profile.workspace_id = ? AND profile.template_version_id = assembly.template_version_id
            JOIN scene_template_version version ON version.id = assembly.template_version_id
            JOIN scene_template template ON template.id = version.template_id
            """
                + filter
                + """
            ORDER BY template.code, assembly.name, assembly.version DESC
            LIMIT ? OFFSET ?
            """,
            (row, index) -> {
              var content = map(row.getString(8));
              return new ReusableAssemblyView(
                  row.getObject(1, UUID.class),
                  row.getString(2),
                  row.getObject(3, UUID.class),
                  row.getString(4),
                  row.getInt(5),
                  row.getLong(6),
                  map(row.getString(7)),
                  objectTypes(content),
                  row.getTimestamp(9).toInstant());
            },
            params.toArray());
    return new PageView<>(items, page, size, total == null ? 0 : total);
  }

  UUID objectTypeId(UUID workspaceId, UUID templateVersionId, String code) {
    return requiredId(
        """
        SELECT id FROM object_type
        WHERE workspace_id = ? AND template_version_id = ? AND code = ? AND published
        """,
        workspaceId,
        templateVersionId,
        code,
        "对象类型不存在或未发布: " + code);
  }

  UUID relationTypeId(UUID workspaceId, UUID templateVersionId, String code) {
    return requiredId(
        """
        SELECT id FROM relation_type
        WHERE workspace_id = ? AND template_version_id = ? AND code = ?
        """,
        workspaceId,
        templateVersionId,
        code,
        "关系类型不存在: " + code);
  }

  UUID createdObjectId(List<String> eventIds) {
    for (var eventId : eventIds) {
      var value =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (value != null) return UUID.fromString(value);
    }
    throw schema("CreateObject 未产生 ObjectCreated 事件");
  }

  private ExistingAssembly findByName(UUID templateVersionId, String name) {
    return jdbc.query(
        """
        SELECT assembly_id, params::text, content::text
        FROM reusable_assembly
        WHERE template_version_id = ? AND name = ?
        """,
        result ->
            result.next()
                ? new ExistingAssembly(
                    result.getObject(1, UUID.class),
                    map(result.getString(2)),
                    map(result.getString(3)))
                : null,
        templateVersionId,
        name);
  }

  private void validateDefine(DefineReusableAssemblyRequest request) {
    if (request.workspaceId() == null
        || request.correlationId() == null
        || blank(request.idempotencyKey())
        || request.templateVersionId() == null
        || blank(request.name())
        || request.content() == null) {
      throw schema("workspaceId、correlationId、idempotencyKey、templateVersionId、name、content 必填");
    }
    if (request.name().length() > 256) throw schema("name 最多 256 字符");
    var exists =
        jdbc.queryForObject(
            "SELECT count(*) FROM scene_template_version WHERE id = ?",
            Long.class,
            request.templateVersionId());
    if (exists == null || exists == 0) throw schema("templateVersionId 不存在");
  }

  private void validateContent(
      UUID workspaceId, UUID templateVersionId, Map<String, Object> content) {
    var objectKeys = new java.util.HashSet<String>();
    for (var object : objects(content)) {
      var key = text(object.get("key"));
      var type = text(object.get("objectType"));
      if (blank(key) || blank(type)) throw schema("content.objects[].key/objectType 必填");
      if (!objectKeys.add(key)) throw schema("content.objects[].key 重复: " + key);
      objectTypeId(workspaceId, templateVersionId, type);
    }
    for (var relation : relations(content)) {
      var type = text(relation.get("relationType"));
      var source = text(relation.get("source"));
      var target = text(relation.get("target"));
      if (blank(type) || blank(source) || blank(target)) {
        throw schema("content.relations[].relationType/source/target 必填");
      }
      if (!objectKeys.contains(source) || !objectKeys.contains(target)) {
        throw schema("content.relations[] 端点必须引用 content.objects[].key");
      }
      relationTypeId(workspaceId, templateVersionId, type);
    }
  }

  @SuppressWarnings("unchecked")
  List<Map<String, Object>> objects(Map<String, Object> content) {
    var values = content.get("objects");
    if (!(values instanceof List<?> list) || list.isEmpty())
      throw schema("content.objects 必须为非空数组");
    return list.stream().map(value -> (Map<String, Object>) value).toList();
  }

  @SuppressWarnings("unchecked")
  List<Map<String, Object>> relations(Map<String, Object> content) {
    var values = content.get("relations");
    if (values == null) return List.of();
    if (!(values instanceof List<?> list)) throw schema("content.relations 必须为数组");
    return list.stream().map(value -> (Map<String, Object>) value).toList();
  }

  @SuppressWarnings("unchecked")
  Map<String, Object> fields(Map<String, Object> value, String name) {
    var fields = value.get(name);
    if (fields == null) return Map.of();
    if (!(fields instanceof Map<?, ?>)) throw schema(name + " 必须为对象");
    return (Map<String, Object>) fields;
  }

  private UUID requiredId(
      String sql, UUID workspaceId, UUID templateVersionId, String code, String message) {
    var values =
        jdbc.query(
            sql,
            (row, index) -> row.getObject(1, UUID.class),
            workspaceId,
            templateVersionId,
            code);
    if (values.isEmpty()) throw schema(message);
    return values.getFirst();
  }

  private static List<String> objectTypes(Map<String, Object> content) {
    if (!(content.get("objects") instanceof List<?> values)) return List.of();
    var result = new java.util.LinkedHashSet<String>();
    for (var value : values) {
      if (value instanceof Map<?, ?> object) {
        var type = text(object.get("objectType"));
        if (!blank(type)) result.add(type);
      }
    }
    return List.copyOf(result);
  }

  private boolean sameJson(Object first, Object second) {
    return mapper.valueToTree(first).equals(mapper.valueToTree(second));
  }

  private Map<String, Object> map(String value) {
    try {
      return mapper.readValue(value, MAP_TYPE);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("reusable_assembly JSON 无法解析", failure);
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("reusable_assembly JSON 无法序列化", failure);
    }
  }

  static CommandRejectedException schema(String message) {
    return new CommandRejectedException(
        new CommandError("KERNEL-400-SCHEMA-INVALID", message, Map.of(), "按命令 Schema 修正载荷后重试"));
  }

  private static CommandRejectedException conflict(String message, UUID assemblyId) {
    return new CommandRejectedException(
        new CommandError(
            "KERNEL-409-IDEMPOTENCY-CONFLICT",
            message,
            Map.of("assemblyId", assemblyId),
            "改用新 name 或保持相同定义"));
  }

  private static CommandResult result(UUID assemblyId, boolean replay) {
    return new CommandResult(
        "assembly:" + assemblyId,
        CommandStatus.COMMITTED,
        replay,
        List.of(assemblyId.toString()),
        null);
  }

  private static boolean blank(String value) {
    return value == null || value.isBlank();
  }

  private static String text(Object value) {
    return value instanceof String text ? text : null;
  }

  record AssemblyDefinition(
      UUID assemblyId,
      String name,
      UUID templateVersionId,
      long version,
      Map<String, Object> params,
      Map<String, Object> content) {}

  private record ExistingAssembly(
      UUID id, Map<String, Object> params, Map<String, Object> content) {}
}
