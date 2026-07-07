package com.mnext.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mnext.engines.rules.EvalContext;
import com.mnext.engines.rules.RuleEvaluator;
import com.mnext.engines.rules.RuleParser;
import com.mnext.kernel.api.Actor;
import com.mnext.kernel.api.BatchItemResult;
import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.CommandResult;
import com.mnext.kernel.api.CommandStatus;
import com.mnext.kernel.api.KernelCommandService;
import com.mnext.kernel.api.SourceInfo;
import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.FieldUpdate;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import com.mnext.server.ai.AiActionProvider;
import com.mnext.server.ai.AiContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class AiChangeRepository implements AiChangeSetSubmitter {
  private static final Pattern FIELD_PLACEHOLDER =
      Pattern.compile("\\$\\{field\\('([a-z][a-z0-9_]{0,127})'\\)\\}");
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final DerivedEvaluator derivedEvaluator;
  private final AiChangeProjection projection;
  private final KernelCommandService commands;
  private final RuleEvaluator evaluator = new RuleEvaluator();

  AiChangeRepository(
      JdbcTemplate jdbc,
      ObjectMapper mapper,
      DerivedEvaluator derivedEvaluator,
      AiChangeProjection projection,
      KernelCommandService commands) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.derivedEvaluator = derivedEvaluator;
    this.projection = projection;
    this.commands = commands;
  }

  CommandResult replay(UUID workspaceId, String idempotencyKey, String payloadHash) {
    var stored =
        jdbc.query(
            """
            SELECT payload_hash, result_snapshot::text
            FROM command_log WHERE workspace_id = ? AND idempotency_key = ?
            """,
            (row, ignored) -> new StoredCommand(row.getString(1), row.getString(2)),
            workspaceId,
            idempotencyKey);
    if (stored.isEmpty()) return null;
    var command = stored.getFirst();
    if (!command.payloadHash().equals(payloadHash)) {
      throw rejected("AI-409-IDEMPOTENCY-CONFLICT", "幂等键已被不同载荷使用", "更换 idempotencyKey 后重试");
    }
    try {
      return mapper.readValue(command.resultSnapshot(), CommandResult.class).replayed();
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("AI 命令结果快照无法解析", failure);
    }
  }

  @Transactional
  CommandResult propose(
      AiActionRequest request,
      String actorId,
      AiActionProvider.ProviderDescriptor provider,
      AiContext context,
      AiActionProvider.AiResult aiResult,
      String payloadHash) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    var setId = UUID.randomUUID();
    var now = Instant.now();
    jdbc.update(
        """
        INSERT INTO ai_change_set
          (id, workspace_id, action, status, created_by, updated_by, provider,
           provider_version, context_hash, result_text, created_at, updated_at)
        VALUES (?, ?, ?, 'PROPOSED', ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        setId,
        request.workspaceId(),
        request.action(),
        actorId,
        actorId,
        provider.providerId(),
        provider.version(),
        context.contextHash(),
        aiResult.text(),
        Timestamp.from(now),
        Timestamp.from(now));
    insertItems(request.workspaceId(), setId, aiResult.items());
    projection.projectProposed(setId);
    var result =
        new CommandResult(
            commandId(), CommandStatus.ACCEPTED, false, List.of(setId.toString()), null);
    remember(
        request.workspaceId(), request.idempotencyKey(), "ProposeAiChange", payloadHash, result);
    return result;
  }

  @Override
  @Transactional
  public CommandResult submitGenerated(
      UUID workspaceId,
      String actorId,
      String idempotencyKey,
      String action,
      AiActionProvider.ProviderDescriptor provider,
      String contextHash,
      AiActionProvider.AiResult aiResult,
      String payloadHash) {
    validateEnvelope(workspaceId, idempotencyKey);
    var setId = UUID.randomUUID();
    var now = Instant.now();
    jdbc.update(
        """
        INSERT INTO ai_change_set
          (id, workspace_id, action, status, created_by, updated_by, provider,
           provider_version, context_hash, result_text, created_at, updated_at)
        VALUES (?, ?, ?, 'PROPOSED', ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        setId,
        workspaceId,
        action,
        actorId,
        actorId,
        provider.providerId(),
        provider.version(),
        contextHash,
        aiResult.text(),
        Timestamp.from(now),
        Timestamp.from(now));
    insertItems(workspaceId, setId, aiResult.items());
    projection.projectProposed(setId);
    var result =
        new CommandResult(
            commandId(), CommandStatus.ACCEPTED, false, List.of(setId.toString()), null);
    remember(workspaceId, idempotencyKey, "SubmitAIChangeSet", payloadHash, result);
    return result;
  }

  @Transactional
  CommandResult reject(RejectAiChangeRequest request, String actorId, String payloadHash) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    var status = status(request.workspaceId(), request.setId());
    if (status == null) {
      throw rejected("AI-404-CHANGESET-NOT-FOUND", "AI 变更集不存在", "刷新列表后选择仍为 PROPOSED 的变更集");
    }
    if (!"PROPOSED".equals(status)) {
      throw rejected("AI-409-INVALID-STATE", "AI 变更集当前状态不可拒绝", "刷新变更集状态后重试");
    }
    jdbc.update(
        """
        UPDATE ai_change_set
        SET status = 'REJECTED', updated_by = ?, updated_at = ?
        WHERE workspace_id = ? AND id = ?
        """,
        actorId,
        Timestamp.from(Instant.now()),
        request.workspaceId(),
        request.setId());
    jdbc.update(
        "UPDATE ai_change_item SET item_status = 'REJECTED' WHERE set_id = ?", request.setId());
    projection.projectRejected(request.setId());
    var result =
        new CommandResult(
            commandId(), CommandStatus.ACCEPTED, false, List.of(request.setId().toString()), null);
    remember(
        request.workspaceId(), request.idempotencyKey(), "RejectAiChange", payloadHash, result);
    return result;
  }

  @Transactional
  CommandResult confirm(ConfirmAiChangeRequest request, String actorId, String payloadHash) {
    validateEnvelope(request.workspaceId(), request.idempotencyKey());
    var status = status(request.workspaceId(), request.setId());
    if (status == null) {
      throw rejected("AI-404-CHANGESET-NOT-FOUND", "AI 变更集不存在", "刷新列表后选择仍为 PROPOSED 的变更集");
    }
    if ("CONFIRMED".equals(status)) {
      var stored = confirmedResult(request.workspaceId(), request.setId());
      return stored == null
          ? confirmedSummary(request.workspaceId(), request.setId())
          : stored.replayed();
    }
    if (!"PROPOSED".equals(status)) {
      throw rejected("AI-409-INVALID-STATE", "AI 变更集当前状态不可确认", "刷新变更集状态后重试");
    }
    var applied = 0;
    var skipped = 0;
    var results = new ArrayList<BatchItemResult>();
    for (var item : changeItems(request.setId())) {
      var precheck = precheck(request.workspaceId(), item.aiItem());
      updateItemPrecheck(item.id(), precheck);
      if ("BLOCKED".equals(precheck.get("verdict"))) {
        skipped++;
        markItem(item.id(), "SKIPPED");
        results.add(skippedItem(item.seq(), precheck));
        continue;
      }
      var written =
          switch (item.opType()) {
            case "UpdateFields" ->
                commands.updateFields(updateCommand(request, item), Actor.user(actorId));
            case "CreateObject" ->
                commands.createObject(createCommand(request, item), Actor.user(actorId));
            default -> throw rejected("AI-422-ITEM-PRECHECK-FAILED", "AI 变更项类型不支持", "刷新变更集后重试");
          };
      applied++;
      markItem(item.id(), "APPLIED");
      results.add(new BatchItemResult(item.seq(), written.status(), null, written.events()));
    }
    var now = Instant.now();
    jdbc.update(
        """
        UPDATE ai_change_set
        SET status = 'CONFIRMED', confirmed_by = ?, confirmed_at = ?,
            updated_by = ?, updated_at = ?
        WHERE workspace_id = ? AND id = ?
        """,
        actorId,
        Timestamp.from(now),
        actorId,
        Timestamp.from(now),
        request.workspaceId(),
        request.setId());
    projection.projectConfirmed(request.setId());
    var result =
        new CommandResult(
            commandId(),
            CommandStatus.ACCEPTED,
            false,
            confirmEvents(request.setId(), applied, skipped, 0),
            null,
            results);
    remember(
        request.workspaceId(), request.idempotencyKey(), "ConfirmAiChange", payloadHash, result);
    return result;
  }

  List<AiChangeSetView> find(UUID workspaceId, String status, UUID setId) {
    var clauses = new ArrayList<String>();
    var args = new ArrayList<Object>();
    clauses.add("workspace_id = ?");
    args.add(workspaceId);
    if (status != null && !status.isBlank()) {
      clauses.add("status = ?");
      args.add(status);
    }
    if (setId != null) {
      clauses.add("id = ?");
      args.add(setId);
    }
    var sets =
        jdbc.query(
            """
            SELECT id, action, status, provider, provider_version, context_hash,
                   result_text, created_at
            FROM rm_ai_change_set
            WHERE %s
            ORDER BY created_at DESC, id LIMIT 200
            """
                .formatted(String.join(" AND ", clauses)),
            (row, ignored) ->
                new AiChangeSetView(
                    row.getObject(1, UUID.class),
                    row.getString(2),
                    row.getString(3),
                    row.getString(4),
                    row.getString(5),
                    row.getString(6),
                    row.getString(7),
                    row.getTimestamp(8).toInstant(),
                    0,
                    0,
                    List.of()),
            args.toArray());
    return sets.stream().map(set -> withItems(set, items(set.setId()))).toList();
  }

  @Override
  public String payloadHash(Object value) {
    return hash(json(value));
  }

  private void insertItems(
      UUID workspaceId, UUID setId, List<AiActionProvider.AiChangeItem> items) {
    var seq = 1;
    for (var item : items) {
      jdbc.update(
          """
          INSERT INTO ai_change_item (id, set_id, seq, op_type, payload, precheck, item_status)
          VALUES (?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), 'PROPOSED')
          """,
          UUID.randomUUID(),
          setId,
          seq++,
          item.opType(),
          json(item.payload()),
          json(precheck(workspaceId, item)));
    }
  }

  private List<ChangeItemRow> changeItems(UUID setId) {
    return jdbc.query(
        """
        SELECT id, seq, op_type, payload::text
        FROM ai_change_item WHERE set_id = ? ORDER BY seq FOR UPDATE
        """,
        (row, ignored) ->
            new ChangeItemRow(
                row.getObject(1, UUID.class),
                row.getInt(2),
                row.getString(3),
                map(row.getString(4))),
        setId);
  }

  private UpdateFieldsCommand updateCommand(ConfirmAiChangeRequest request, ChangeItemRow item) {
    if (!"UpdateFields".equals(item.opType())) {
      throw rejected("AI-422-ITEM-PRECHECK-FAILED", "AI 变更项类型不支持", "刷新变更集后重试");
    }
    var objectId = uuid(item.payload().get("objectId"));
    var object = object(request.workspaceId(), objectId);
    if (object == null) {
      throw rejected("AI-404-CHANGESET-NOT-FOUND", "AI 变更项目标对象不存在", "刷新变更集后重试");
    }
    return new UpdateFieldsCommand(
        request.workspaceId(),
        request.correlationId(),
        "aiconfirm:" + request.setId() + ":item:" + item.seq(),
        objectId,
        object.version(),
        fields(item.payload()).stream()
            .map(
                field ->
                    new FieldUpdate(
                        String.valueOf(field.get("fieldDefCode")), field.get("value"), null))
            .toList());
  }

  private CreateObjectCommand createCommand(ConfirmAiChangeRequest request, ChangeItemRow item) {
    if (!"CreateObject".equals(item.opType())) {
      throw rejected("AI-422-ITEM-PRECHECK-FAILED", "AI 变更项类型不支持", "刷新变更集后重试");
    }
    return new CreateObjectCommand(
        request.workspaceId(),
        request.correlationId(),
        "aiconfirm:" + request.setId() + ":item:" + item.seq(),
        createObjectTypeId(request.workspaceId(), item.payload()),
        createFields(item.payload()),
        new SourceInfo("manual", "ai-change-set:" + request.setId()),
        "DRAFT");
  }

  private void updateItemPrecheck(UUID itemId, Map<String, Object> precheck) {
    jdbc.update(
        "UPDATE ai_change_item SET precheck = CAST(? AS jsonb) WHERE id = ?",
        json(precheck),
        itemId);
  }

  private void markItem(UUID itemId, String status) {
    jdbc.update("UPDATE ai_change_item SET item_status = ? WHERE id = ?", status, itemId);
  }

  private BatchItemResult skippedItem(int seq, Map<String, Object> precheck) {
    return new BatchItemResult(
        seq,
        CommandStatus.REJECTED,
        new CommandError(
            "AI-422-ITEM-PRECHECK-FAILED",
            "AI 变更项确认预检未通过",
            Map.of("precheck", precheck),
            "查看规则详情并调整后重新发起 AI 变更"),
        List.of());
  }

  private Map<String, Object> precheck(UUID workspaceId, AiActionProvider.AiChangeItem item) {
    if ("CreateObject".equals(item.opType())) {
      return precheckCreateObject(workspaceId, item.payload());
    }
    if (!"UpdateFields".equals(item.opType())) {
      return precheck("BLOCKED", List.of(Map.of("reason", "unsupported_op_type")));
    }
    var objectId = uuid(item.payload().get("objectId"));
    var object = object(workspaceId, objectId);
    if (object == null) {
      return precheck("BLOCKED", List.of(Map.of("reason", "object_not_found")));
    }
    var targetFields = new LinkedHashMap<String, Object>(object.fields());
    for (var field : fields(item.payload())) {
      targetFields.put(String.valueOf(field.get("fieldDefCode")), field.get("value"));
    }
    targetFields.put("$objectId", object.objectId());
    var details = new ArrayList<Map<String, Object>>();
    for (var rule : applicableRules(workspaceId, object.objectTypeId())) {
      try {
        var context = context(workspaceId, object, targetFields);
        if (evaluator.evaluate(RuleParser.parse(rule.whenSrc()), context)) {
          details.add(
              Map.of(
                  "ruleCode", rule.ruleCode(),
                  "severity", rule.severity(),
                  "message", interpolate(rule.message(), context),
                  "fieldCode", rule.fieldCode() == null ? "" : rule.fieldCode()));
        }
      } catch (RuntimeException failure) {
        details.add(
            Map.of(
                "ruleCode",
                rule.ruleCode(),
                "severity",
                "BLOCK",
                "message",
                "规则预检求值失败: " + failure.getMessage(),
                "fieldCode",
                rule.fieldCode() == null ? "" : rule.fieldCode()));
      }
    }
    if (details.stream().anyMatch(detail -> "BLOCK".equals(detail.get("severity")))) {
      return precheck("BLOCKED", details);
    }
    if (!details.isEmpty()) return precheck("WARN", details);
    return precheck("WRITABLE", List.of());
  }

  private Map<String, Object> precheckCreateObject(UUID workspaceId, Map<String, Object> payload) {
    var objectTypeId = createObjectTypeId(workspaceId, payload);
    if (objectTypeId == null) {
      return precheck("BLOCKED", List.of(Map.of("reason", "object_type_not_found")));
    }
    var fields = createFields(payload);
    if (string(fields.get("name")).isBlank()) {
      return precheck("BLOCKED", List.of(Map.of("reason", "name_required")));
    }
    return precheck("WRITABLE", List.of());
  }

  private EvalContext context(UUID workspaceId, ObjectRow object, Map<String, Object> values) {
    return new EvalContext() {
      @Override
      public Object fieldValue(String code) {
        if (values.containsKey(code)) return values.get(code);
        return derivedEvaluator.evaluate(
            workspaceId, object.objectId(), object.objectTypeId(), values, code);
      }

      @Override
      public int relationCount(String type) {
        return directRelationCount(workspaceId, object.objectId(), type);
      }

      @Override
      public boolean hasRelation(String type) {
        return relationCount(type) > 0;
      }
    };
  }

  private ObjectRow object(UUID workspaceId, UUID objectId) {
    if (objectId == null) return null;
    var rows =
        jdbc.query(
            """
            SELECT object.id, type.id, object.version,
                   COALESCE(
                     jsonb_object_agg(field.code, value.value)
                       FILTER (WHERE field.id IS NOT NULL),
                     '{}'::jsonb)::text
            FROM data_object object
            JOIN object_type type ON type.id = object.object_type_id
            LEFT JOIN data_field_value value ON value.object_id = object.id
            LEFT JOIN field_def field ON field.id = value.field_def_id
            WHERE object.workspace_id = ? AND object.id = ?
            GROUP BY object.id, type.id, object.version
            """,
            (row, ignored) ->
                new ObjectRow(
                    row.getObject(1, UUID.class),
                    row.getObject(2, UUID.class),
                    row.getLong(3),
                    map(row.getString(4))),
            workspaceId,
            objectId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private List<RuleRow> applicableRules(UUID workspaceId, UUID objectTypeId) {
    return jdbc.query(
        """
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_type_id FROM object_type WHERE workspace_id = ? AND id = ?
          UNION ALL
          SELECT parent.id, parent.parent_type_id
          FROM object_type parent
          JOIN ancestors child ON parent.id = child.parent_type_id
          WHERE parent.workspace_id = ?
        )
        SELECT rule.rule_code, rule.severity, rule.when_src, rule.message, field.code
        FROM rule_def rule
        LEFT JOIN field_def field ON field.id = rule.scope_field_def_id
        WHERE rule.workspace_id = ? AND rule.published = TRUE
          AND rule.scope_object_type_id IN (SELECT id FROM ancestors)
        ORDER BY rule.rule_code
        """,
        (row, ignored) ->
            new RuleRow(
                row.getString(1),
                row.getString(2),
                row.getString(3),
                row.getString(4),
                row.getString(5)),
        workspaceId,
        objectTypeId,
        workspaceId,
        workspaceId);
  }

  private int directRelationCount(UUID workspaceId, UUID objectId, String relationTypeCode) {
    return jdbc.queryForObject(
        """
        SELECT count(*) FROM (
          SELECT relation_id FROM rm_relation
          WHERE workspace_id = ? AND relation_type_code = ? AND status = 'ACTIVE'
            AND (source_id = ? OR target_id = ?)
          LIMIT 201
        ) limited_relations
        """,
        Integer.class,
        workspaceId,
        relationTypeCode,
        objectId,
        objectId);
  }

  private List<AiChangeItemView> items(UUID setId) {
    return jdbc.query(
        """
        SELECT id, seq, op_type, payload::text, precheck::text, item_status
        FROM rm_ai_change_item WHERE set_id = ? ORDER BY seq
        """,
        (row, ignored) ->
            new AiChangeItemView(
                row.getObject(1, UUID.class),
                row.getInt(2),
                row.getString(3),
                map(row.getString(4)),
                map(row.getString(5)),
                row.getString(6)),
        setId);
  }

  private AiChangeSetView withItems(AiChangeSetView set, List<AiChangeItemView> items) {
    var applied = items.stream().filter(item -> "APPLIED".equals(item.itemStatus())).count();
    var skipped = items.stream().filter(item -> "SKIPPED".equals(item.itemStatus())).count();
    return new AiChangeSetView(
        set.setId(),
        set.action(),
        set.status(),
        set.provider(),
        set.providerVersion(),
        set.contextHash(),
        set.resultText(),
        set.createdAt(),
        applied,
        skipped,
        items);
  }

  private void remember(
      UUID workspaceId,
      String idempotencyKey,
      String commandType,
      String payloadHash,
      CommandResult result) {
    jdbc.update(
        """
        INSERT INTO command_log
          (workspace_id, idempotency_key, command_id, command_type, payload_hash,
           result_snapshot, decided_at)
        VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
        """,
        workspaceId,
        idempotencyKey,
        result.commandId(),
        commandType,
        payloadHash,
        json(result),
        Timestamp.from(Instant.now()));
  }

  private String status(UUID workspaceId, UUID setId) {
    var values =
        jdbc.query(
            "SELECT status FROM ai_change_set WHERE workspace_id = ? AND id = ?",
            (row, ignored) -> row.getString(1),
            workspaceId,
            setId);
    return values.isEmpty() ? null : values.getFirst();
  }

  private CommandResult confirmedResult(UUID workspaceId, UUID setId) {
    var results =
        jdbc.query(
            """
            SELECT result_snapshot::text
            FROM command_log
            WHERE workspace_id = ? AND command_type = 'ConfirmAiChange'
              AND result_snapshot->'events' @> CAST(? AS jsonb)
            ORDER BY decided_at LIMIT 1
            """,
            (row, ignored) -> row.getString(1),
            workspaceId,
            json(List.of(setId.toString())));
    if (results.isEmpty()) return null;
    try {
      return mapper.readValue(results.getFirst(), CommandResult.class);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("AI 确认结果快照无法解析", failure);
    }
  }

  private CommandResult confirmedSummary(UUID workspaceId, UUID setId) {
    var counts =
        jdbc.queryForMap(
            """
            SELECT count(*) FILTER (WHERE item_status = 'APPLIED') AS applied,
                   count(*) FILTER (WHERE item_status = 'SKIPPED') AS skipped
            FROM ai_change_item item
            JOIN ai_change_set change_set ON change_set.id = item.set_id
            WHERE change_set.workspace_id = ? AND change_set.id = ?
            """,
            workspaceId,
            setId);
    var applied = ((Number) counts.get("applied")).intValue();
    var skipped = ((Number) counts.get("skipped")).intValue();
    return new CommandResult(
        commandId(), CommandStatus.ACCEPTED, true, confirmEvents(setId, applied, skipped, 0), null);
  }

  private List<String> confirmEvents(UUID setId, int applied, int skipped, int errors) {
    return List.of(
        setId.toString(), "applied=" + applied, "skipped=" + skipped, "errors=" + errors);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> fields(Map<String, Object> payload) {
    var fields = payload.get("fields");
    if (fields instanceof List<?> values) return (List<Map<String, Object>>) values;
    return List.of();
  }

  private Map<String, Object> createFields(Map<String, Object> payload) {
    var fields = payload.get("fields");
    if (!(fields instanceof Map<?, ?> values)) return Map.of();
    var result = new LinkedHashMap<String, Object>();
    values.forEach((key, value) -> result.put(String.valueOf(key), value));
    return result;
  }

  private UUID createObjectTypeId(UUID workspaceId, Map<String, Object> payload) {
    var id = uuid(payload.get("objectTypeId"));
    if (id != null && objectTypePublished(workspaceId, id)) return id;
    var code = string(payload.get("objectTypeCode"));
    if (code.isBlank()) return null;
    var values =
        jdbc.query(
            "SELECT id FROM object_type WHERE workspace_id = ? AND code = ? AND published",
            (row, ignored) -> row.getObject(1, UUID.class),
            workspaceId,
            code);
    return values.isEmpty() ? null : values.getFirst();
  }

  private boolean objectTypePublished(UUID workspaceId, UUID objectTypeId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM object_type WHERE workspace_id = ? AND id = ? AND published)",
            Boolean.class,
            workspaceId,
            objectTypeId));
  }

  private Map<String, Object> precheck(String verdict, List<Map<String, Object>> details) {
    return Map.of("verdict", verdict, "details", details);
  }

  private Map<String, Object> map(String value) {
    try {
      return mapper.readValue(value, new TypeReference<>() {});
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("AI 变更 JSON 无法解析", failure);
    }
  }

  private String json(Object value) {
    try {
      return mapper.writeValueAsString(value);
    } catch (JsonProcessingException failure) {
      throw new IllegalArgumentException("AI 变更 JSON 无法序列化", failure);
    }
  }

  private static String interpolate(String message, EvalContext context) {
    var matcher = FIELD_PLACEHOLDER.matcher(message);
    var interpolated = new StringBuilder();
    while (matcher.find()) {
      var value = context.fieldValue(matcher.group(1));
      matcher.appendReplacement(
          interpolated, Matcher.quoteReplacement(value == null ? "" : String.valueOf(value)));
    }
    matcher.appendTail(interpolated);
    return interpolated.toString();
  }

  private static UUID uuid(Object value) {
    if (value instanceof UUID id) return id;
    if (!(value instanceof String text) || text.isBlank()) return null;
    return UUID.fromString(text);
  }

  private static String string(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }

  private static void validateEnvelope(UUID workspaceId, String idempotencyKey) {
    if (workspaceId == null || idempotencyKey == null || idempotencyKey.isBlank()) {
      throw rejected("AI-400-SCHEMA-INVALID", "AI 命令信封无效", "按 AI 命令 Schema 修正载荷后重试");
    }
  }

  private static CommandRejectedException rejected(String code, String message, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, Map.of(), suggestion));
  }

  private static String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 不可用", failure);
    }
  }

  private static String commandId() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 26);
  }

  private record StoredCommand(String payloadHash, String resultSnapshot) {}

  private record ObjectRow(
      UUID objectId, UUID objectTypeId, long version, Map<String, Object> fields) {}

  private record ChangeItemRow(UUID id, int seq, String opType, Map<String, Object> payload) {
    AiActionProvider.AiChangeItem aiItem() {
      return new AiActionProvider.AiChangeItem(opType, payload);
    }
  }

  private record RuleRow(
      String ruleCode, String severity, String whenSrc, String message, String fieldCode) {}
}
