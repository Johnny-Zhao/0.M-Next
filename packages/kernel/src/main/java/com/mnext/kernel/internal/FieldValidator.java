package com.mnext.kernel.internal;

import com.mnext.kernel.api.commands.CreateObjectCommand;
import com.mnext.kernel.api.commands.UpdateFieldsCommand;
import com.mnext.kernel.api.metamodel.DataType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

final class FieldValidator {
  private FieldValidator() {}

  static void validate(
      CreateObjectCommand command,
      Map<String, FieldDefinition> definitions,
      ReferenceLookup references) {
    validate(command.workspaceId(), definitions, command.fields(), references);
  }

  static void validate(
      UpdateFieldsCommand command,
      Map<String, FieldDefinition> definitions,
      ReferenceLookup references) {
    var values = new java.util.LinkedHashMap<String, Object>();
    command.fields().forEach(update -> values.put(update.fieldDefCode(), update.value()));
    var updated = new java.util.LinkedHashMap<String, FieldDefinition>();
    values
        .keySet()
        .forEach(
            code -> {
              if (definitions.containsKey(code)) updated.put(code, definitions.get(code));
            });
    validate(command.workspaceId(), updated, values, references);
  }

  static void validate(
      UUID workspaceId,
      Map<String, FieldDefinition> definitions,
      Map<String, Object> values,
      ReferenceLookup references) {
    var violations = new ArrayList<Map<String, Object>>();
    definitions.values().stream()
        .filter(FieldDefinition::required)
        .filter(definition -> values.get(definition.code()) == null)
        .forEach(definition -> violations.add(violation(definition.code(), "必填字段缺失")));
    values.forEach(
        (code, value) -> {
          var definition = definitions.get(code);
          if (definition != null && value != null) {
            validateValue(workspaceId, definition, value, references, violations);
          }
        });
    if (!violations.isEmpty()) throw CommandErrors.fieldValue(violations);
  }

  private static void validateValue(
      UUID workspaceId,
      FieldDefinition definition,
      Object value,
      ReferenceLookup references,
      List<Map<String, Object>> violations) {
    if (!matchesType(definition.dataType(), value)) {
      violations.add(violation(definition.code(), "类型不匹配"));
      return;
    }
    var constraints = definition.constraints();
    if (value instanceof String text) {
      if (constraints.minLength() != null && text.length() < constraints.minLength()) {
        violations.add(violation(definition.code(), "长度小于 minLength"));
      }
      if (constraints.maxLength() != null && text.length() > constraints.maxLength()) {
        violations.add(violation(definition.code(), "长度大于 maxLength"));
      }
      if (constraints.pattern() != null && !matchesPattern(constraints.pattern(), text)) {
        violations.add(violation(definition.code(), "不匹配 pattern"));
      }
      if (definition.dataType() == DataType.ENUM
          && (constraints.enumValues() == null || !constraints.enumValues().contains(text))) {
        violations.add(violation(definition.code(), "值不在 enumValues 中"));
      }
      if (definition.dataType() == DataType.REF
          && !references.exists(
              workspaceId, UUID.fromString(text), constraints.refObjectTypeCode())) {
        violations.add(violation(definition.code(), "ref 指向不存在对象"));
      }
    }
    if (value instanceof Number number) {
      var decimal = new BigDecimal(number.toString());
      if (constraints.min() != null && decimal.compareTo(constraints.min()) < 0) {
        violations.add(violation(definition.code(), "值小于 min"));
      }
      if (constraints.max() != null && decimal.compareTo(constraints.max()) > 0) {
        violations.add(violation(definition.code(), "值大于 max"));
      }
    }
  }

  private static boolean matchesType(DataType type, Object value) {
    return switch (type) {
      case STRING, TEXT, ENUM -> value instanceof String;
      case INTEGER ->
          value instanceof Byte
              || value instanceof Short
              || value instanceof Integer
              || value instanceof Long;
      case NUMBER -> value instanceof Number;
      case BOOLEAN -> value instanceof Boolean;
      case DATE -> validDate(value);
      case DATETIME -> validDateTime(value);
      case REF -> validUuid(value);
      case JSON -> value instanceof Map<?, ?> || value instanceof List<?>;
    };
  }

  private static boolean validDate(Object value) {
    if (!(value instanceof String text)) return false;
    try {
      LocalDate.parse(text);
      return true;
    } catch (DateTimeParseException ignored) {
      return false;
    }
  }

  private static boolean validDateTime(Object value) {
    if (!(value instanceof String text)) return false;
    try {
      OffsetDateTime.parse(text);
      return true;
    } catch (DateTimeParseException ignored) {
      return false;
    }
  }

  private static boolean validUuid(Object value) {
    if (!(value instanceof String text)) return false;
    try {
      UUID.fromString(text);
      return true;
    } catch (IllegalArgumentException ignored) {
      return false;
    }
  }

  private static boolean matchesPattern(String pattern, String value) {
    try {
      return Pattern.matches(pattern, value);
    } catch (PatternSyntaxException ignored) {
      return false;
    }
  }

  private static Map<String, Object> violation(String code, String reason) {
    return Map.of("fieldDefCode", code, "reason", reason);
  }

  @FunctionalInterface
  interface ReferenceLookup {
    boolean exists(UUID workspaceId, UUID objectId, String objectTypeCode);
  }
}
