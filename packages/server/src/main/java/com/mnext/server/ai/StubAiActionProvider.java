package com.mnext.server.ai;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class StubAiActionProvider implements AiActionProvider {
  private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("stub", "1a");

  @Override
  public ProviderDescriptor descriptor() {
    return DESCRIPTOR;
  }

  @Override
  public AiResult execute(AiAction action, AiContext context) {
    return switch (action) {
      case SUGGEST_FIELDS -> suggestFields(context);
      case EXPLAIN_CHECK -> explainChecks(context);
    };
  }

  private AiResult suggestFields(AiContext context) {
    var items = new ArrayList<AiChangeItem>();
    for (var object : context.management().selectedObjects()) {
      var fields = context.result().objectFields().getOrDefault(object.objectId(), Map.of());
      var definitions =
          context.process().fieldDefsByObjectType().getOrDefault(object.objectType(), List.of());
      for (var definition : definitions) {
        if (!definition.required() || filled(fields.get(definition.code()))) continue;
        var payload = new LinkedHashMap<String, Object>();
        payload.put("objectId", object.objectId().toString());
        payload.put("expectedObjectVersion", object.version());
        payload.put(
            "fields",
            List.of(
                Map.of(
                    "fieldDefCode", definition.code(),
                    "value", suggestedValue(definition),
                    "expectedFieldVersion", object.version())));
        items.add(new AiChangeItem("UpdateFields", payload));
      }
    }
    return new AiResult(null, items);
  }

  private AiResult explainChecks(AiContext context) {
    if (context.management().checkResults().isEmpty()) {
      return new AiResult("当前上下文没有可解释的检查结果。", List.of());
    }
    var lines = new ArrayList<String>();
    for (var check : context.management().checkResults()) {
      lines.add(
          check.severity()
              + " "
              + check.ruleCode()
              + " on "
              + check.objectId()
              + (check.fieldCode() == null ? "" : "." + check.fieldCode())
              + ": "
              + check.message());
    }
    return new AiResult(String.join("\n", lines), List.of());
  }

  private static Object suggestedValue(AiContext.FieldDefCtx definition) {
    var enumValues = definition.constraints().get("enum");
    if (enumValues instanceof List<?> values && !values.isEmpty()) return values.getFirst();
    return switch (definition.dataType()) {
      case "number", "integer", "decimal" -> 0;
      case "boolean" -> false;
      default -> "AI_PLACEHOLDER_" + definition.code();
    };
  }

  private static boolean filled(Object value) {
    return value != null && (!(value instanceof String text) || !text.isBlank());
  }
}
