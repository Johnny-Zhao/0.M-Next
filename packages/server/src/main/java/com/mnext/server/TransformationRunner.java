package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.rules.EvalContext;
import com.mnext.engines.rules.RuleEvaluator;
import com.mnext.engines.rules.RuleParser;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.CreateRelationCommand;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class TransformationRunner {
  static final int MAX_SOURCE_OBJECTS = 1000;
  static final int MAX_GENERATED = 2000;

  private final TransformationRepository transformations;
  private final KernelCommandService commands;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final RuleEvaluator evaluator = new RuleEvaluator();

  TransformationRunner(
      TransformationRepository transformations,
      KernelCommandService commands,
      JdbcTemplate jdbc,
      ObjectMapper mapper) {
    this.transformations = transformations;
    this.commands = commands;
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @Transactional
  CommandResult run(RunTransformationRequest request, Actor actor) {
    if (request.workspaceId() == null || blank(request.transformationCode())) {
      throw TransformationRepository.error(
          "M2M-422-SOURCE-UNRESOLVED", "转换执行载荷不完整", Map.of(), "确认 transformationCode 后重试");
    }
    var definition = transformations.find(request.workspaceId(), request.transformationCode());
    var runId = UUID.randomUUID();
    var generated = 0;
    var skipped = 0;
    var targetsBySource = new LinkedHashMap<UUID, UUID>();
    var sourceObjects = sourceObjects(request.workspaceId(), definition);
    for (var source : sourceObjects) {
      var existing = provenance(request.workspaceId(), definition.code(), source.objectId());
      if (existing != null) {
        targetsBySource.put(source.objectId(), existing);
        skipped++;
        continue;
      }
      generated = requireGeneratedWithinLimit(generated + 2);
      var target =
          generateObject(
              request.workspaceId(), definition.code(), source, request.correlationId(), actor);
      targetsBySource.put(source.objectId(), target);
      generateCorrespondence(
          request.workspaceId(),
          definition,
          source.objectId(),
          target,
          request.correlationId(),
          actor);
      rememberProvenance(
          request.workspaceId(), definition.code(), source.objectId(), target, runId);
    }
    for (var mapping : definition.relationMappings()) {
      var sourceRelations = sourceRelations(request.workspaceId(), mapping.sourceRelationCode());
      for (var relation : sourceRelations) {
        var sourceTarget = targetsBySource.get(relation.sourceId());
        var targetTarget = targetsBySource.get(relation.targetId());
        if (sourceTarget == null || targetTarget == null) {
          skipped++;
          continue;
        }
        generated = requireGeneratedWithinLimit(generated + 1);
        generateRelation(
            request.workspaceId(),
            definition.code(),
            mapping.targetRelationCode(),
            relation.relationId(),
            sourceTarget,
            targetTarget,
            request.correlationId(),
            actor);
      }
    }
    return new CommandResult(
        TransformationRepository.commandId(),
        CommandStatus.ACCEPTED,
        false,
        List.of(runId.toString()),
        null);
  }

  private List<SourceObject> sourceObjects(
      UUID workspaceId, TransformationRepository.TransformationDefinition definition) {
    var result = new ArrayList<SourceObject>();
    for (var mapping : definition.objectMappings()) {
      var total =
          jdbc.queryForObject(
              """
              SELECT count(*)
              FROM rm_object
              WHERE workspace_id = ? AND object_type_code = ?
              """,
              Long.class,
              workspaceId,
              mapping.sourceTypeCode());
      if (total > MAX_SOURCE_OBJECTS || result.size() + total > MAX_SOURCE_OBJECTS) {
        throw TransformationRepository.error(
            "M2M-422-SOURCE-UNRESOLVED",
            "源对象数量超过转换上限",
            Map.of("count", result.size() + total, "limit", MAX_SOURCE_OBJECTS),
            "缩小转换范围后重试");
      }
      result.addAll(
          jdbc.query(
              """
              SELECT object_id, fields::text
              FROM rm_object
              WHERE workspace_id = ? AND object_type_code = ?
              ORDER BY object_id
              LIMIT ?
              """,
              (row, index) ->
                  new SourceObject(row.getObject(1, UUID.class), mapping, map(row.getString(2))),
              workspaceId,
              mapping.sourceTypeCode(),
              MAX_SOURCE_OBJECTS));
    }
    return result;
  }

  private UUID generateObject(
      UUID workspaceId,
      String transformationCode,
      SourceObject source,
      UUID correlationId,
      Actor actor) {
    var targetTypeId = objectTypeId(workspaceId, source.mapping().targetTypeCode());
    var fields = new LinkedHashMap<String, Object>();
    var context = new ObjectEvalContext(source.fields());
    for (var mapping : source.mapping().fieldMappings()) {
      fields.put(
          mapping.targetFieldCode(),
          evaluator.evaluateValue(RuleParser.parse(mapping.expression()), context));
    }
    var result =
        commands.createObject(
            new CreateObjectCommand(
                workspaceId,
                correlationId,
                "t:" + transformationCode + ":o:" + source.objectId(),
                targetTypeId,
                fields,
                new SourceInfo("system", "m2m:" + transformationCode),
                null),
            actor);
    ensureAccepted(result);
    return createdObjectId(result.events());
  }

  private void generateCorrespondence(
      UUID workspaceId,
      TransformationRepository.TransformationDefinition definition,
      UUID source,
      UUID target,
      UUID correlationId,
      Actor actor) {
    generateRelation(
        workspaceId,
        definition.code(),
        definition.correspondenceRelationCode(),
        source,
        source,
        target,
        correlationId,
        actor,
        "c");
  }

  private void generateRelation(
      UUID workspaceId,
      String transformationCode,
      String relationTypeCode,
      UUID sourceRelationId,
      UUID source,
      UUID target,
      UUID correlationId,
      Actor actor) {
    generateRelation(
        workspaceId,
        transformationCode,
        relationTypeCode,
        sourceRelationId,
        source,
        target,
        correlationId,
        actor,
        "r");
  }

  private void generateRelation(
      UUID workspaceId,
      String transformationCode,
      String relationTypeCode,
      UUID keySourceId,
      UUID source,
      UUID target,
      UUID correlationId,
      Actor actor,
      String keyKind) {
    var result =
        commands.createRelation(
            new CreateRelationCommand(
                workspaceId,
                correlationId,
                "t:" + transformationCode + ":" + keyKind + ":" + keySourceId,
                relationTypeId(workspaceId, relationTypeCode),
                source,
                target,
                Map.of(),
                new SourceInfo("system", "m2m:" + transformationCode)),
            actor);
    ensureAccepted(result);
  }

  private List<SourceRelation> sourceRelations(UUID workspaceId, String relationTypeCode) {
    return jdbc.query(
        """
        SELECT relation_id, source_id, target_id
        FROM rm_relation
        WHERE workspace_id = ? AND relation_type_code = ? AND status = 'ACTIVE'
        ORDER BY relation_id
        LIMIT ?
        """,
        (row, index) ->
            new SourceRelation(
                row.getObject(1, UUID.class),
                row.getObject(2, UUID.class),
                row.getObject(3, UUID.class)),
        workspaceId,
        relationTypeCode,
        MAX_GENERATED + 1);
  }

  private int requireGeneratedWithinLimit(int generated) {
    if (generated > MAX_GENERATED) {
      throw TransformationRepository.error(
          "M2M-422-TARGET-UNRESOLVED",
          "生成数量超过转换上限",
          Map.of("count", generated, "limit", MAX_GENERATED),
          "缩小转换范围后重试");
    }
    return generated;
  }

  private UUID provenance(UUID workspaceId, String code, UUID sourceObjectId) {
    return jdbc.query(
        """
        SELECT target_object_id
        FROM m2m_provenance
        WHERE workspace_id = ? AND transformation_code = ? AND source_object_id = ?
        """,
        result -> result.next() ? result.getObject(1, UUID.class) : null,
        workspaceId,
        code,
        sourceObjectId);
  }

  private void rememberProvenance(
      UUID workspaceId, String code, UUID sourceObjectId, UUID targetObjectId, UUID runId) {
    jdbc.update(
        """
        INSERT INTO m2m_provenance
          (id, workspace_id, transformation_code, source_object_id, target_object_id,
           run_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, transformation_code, source_object_id) DO NOTHING
        """,
        UUID.randomUUID(),
        workspaceId,
        code,
        sourceObjectId,
        targetObjectId,
        runId,
        Timestamp.from(Instant.now()));
  }

  private UUID objectTypeId(UUID workspaceId, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM object_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspaceId,
        code);
  }

  private UUID relationTypeId(UUID workspaceId, String code) {
    return jdbc.queryForObject(
        "SELECT id FROM relation_type WHERE workspace_id = ? AND code = ?",
        UUID.class,
        workspaceId,
        code);
  }

  private UUID createdObjectId(List<String> eventIds) {
    for (var eventId : eventIds) {
      var value =
          jdbc.query(
              "SELECT payload->'after'->>'objectId' FROM event_outbox WHERE id = ?",
              result -> result.next() ? result.getString(1) : null,
              eventId);
      if (value != null) return UUID.fromString(value);
    }
    throw TransformationRepository.error(
        "M2M-422-TARGET-UNRESOLVED", "目标对象事件缺失", Map.of(), "检查目标对象生成结果");
  }

  private void ensureAccepted(CommandResult result) {
    if (result.status() != CommandStatus.ACCEPTED && result.status() != CommandStatus.COMMITTED) {
      throw TransformationRepository.error(
          "M2M-422-TARGET-UNRESOLVED", "目标模型生成失败", Map.of("error", result.error()), "检查目标类型约束与规则");
    }
  }

  private Map<String, Object> map(String value) {
    try {
      return mapper.readValue(value, new TypeReference<>() {});
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("读模型字段 JSON 无法解析", failure);
    }
  }

  private static boolean blank(String value) {
    return value == null || value.isBlank();
  }

  private record SourceObject(UUID objectId, ObjectMapping mapping, Map<String, Object> fields) {}

  private record SourceRelation(UUID relationId, UUID sourceId, UUID targetId) {}

  private record ObjectEvalContext(Map<String, Object> fields) implements EvalContext {
    @Override
    public Object fieldValue(String code) {
      return fields.get(code);
    }

    @Override
    public int relationCount(String type) {
      return 0;
    }

    @Override
    public boolean hasRelation(String type) {
      return false;
    }
  }
}
