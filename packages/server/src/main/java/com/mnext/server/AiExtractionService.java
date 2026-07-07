package com.mnext.server;

import com.mnext.kernel.api.CommandResult;
import com.mnext.server.ai.AiActionProvider;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.stereotype.Service;

@Service
class AiExtractionService {
  static final int MAX_DRAFT_CHARS = 8000;
  static final String ACTION = "EXTRACT_MODULES";
  private static final String MODULE_TYPE = "module";

  private final AiExtractionGateway gateway;
  private final AiChangeSetSubmitter submitter;
  private final ReadModelRepository readModel;

  AiExtractionService(
      AiExtractionGateway gateway, AiChangeSetSubmitter submitter, ReadModelRepository readModel) {
    this.gateway = gateway;
    this.submitter = submitter;
    this.readModel = readModel;
  }

  UUID extract(UUID workspaceId, String actorId, String draft) {
    var normalizedDraft = validateDraft(draft);
    var modules = gateway.extractModules(normalizedDraft);
    if (modules.isEmpty()) {
      throw AiExtractionGateway.error("AI-422-EXTRACT-EMPTY", "草稿中没有可抽取的模块", "补充明确的模块名称后重试");
    }
    var objectTypeId = moduleTypeId(workspaceId);
    var items =
        modules.stream()
            .map(
                module ->
                    new AiActionProvider.AiChangeItem(
                        "CreateObject", payload(objectTypeId, module)))
            .toList();
    var commandPayload =
        Map.of("workspaceId", workspaceId, "action", ACTION, "draft", normalizedDraft);
    var payloadHash = submitter.payloadHash(commandPayload);
    var result =
        submitter.submitGenerated(
            workspaceId,
            actorId,
            "aiextract:" + UUID.randomUUID(),
            ACTION,
            gateway.descriptor(),
            submitter.payloadHash(
                Map.of("draft", normalizedDraft, "provider", gateway.descriptor())),
            new AiActionProvider.AiResult(resultText(modules), items),
            payloadHash);
    return setId(result);
  }

  private String validateDraft(String draft) {
    if (draft == null || draft.isBlank()) {
      throw AiExtractionGateway.error("AI-400-SCHEMA-INVALID", "draft 必填", "传入非空 draft 后重试");
    }
    var value = draft.trim();
    if (value.length() > MAX_DRAFT_CHARS) {
      throw AiExtractionGateway.error("AI-400-SCHEMA-INVALID", "draft 不能超过 8000 字", "缩短草稿后重试");
    }
    return value;
  }

  private UUID moduleTypeId(UUID workspaceId) {
    try {
      return readModel.objectTypeId(workspaceId, MODULE_TYPE);
    } catch (EmptyResultDataAccessException failure) {
      throw AiExtractionGateway.error(
          "AI-422-EXTRACT-TYPE-MISSING", "当前工作空间没有 module 类型", "先安装包含模块定义的模板后重试");
    }
  }

  private Map<String, Object> payload(
      UUID objectTypeId, AiExtractionGateway.ExtractedModule module) {
    var fields = new LinkedHashMap<String, Object>();
    fields.put("name", module.name());
    if (module.powerW() != null) fields.put("power_w", module.powerW());
    if (module.responsibility() != null) fields.put("responsibility", module.responsibility());
    if (module.description() != null) fields.put("description", module.description());
    var payload = new LinkedHashMap<String, Object>();
    payload.put("objectTypeCode", MODULE_TYPE);
    payload.put("objectTypeId", objectTypeId.toString());
    payload.put("fields", fields);
    return payload;
  }

  private static String resultText(List<AiExtractionGateway.ExtractedModule> modules) {
    return "抽取到 " + modules.size() + " 个模块，等待人工确认。";
  }

  private static UUID setId(CommandResult result) {
    if (result.events() == null || result.events().isEmpty()) {
      throw AiExtractionGateway.error("AI-422-PROVIDER-FAILED", "AI 变更集提交失败", "稍后重试");
    }
    return UUID.fromString(result.events().getFirst());
  }
}
