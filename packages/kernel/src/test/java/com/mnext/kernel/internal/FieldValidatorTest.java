package com.mnext.kernel.internal;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.mnext.kernel.api.CommandRejectedException;
import com.mnext.kernel.api.metamodel.DataType;
import com.mnext.kernel.api.metamodel.FieldConstraints;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class FieldValidatorTest {
  private static final UUID WORKSPACE = UUID.randomUUID();
  private static final String REF = UUID.randomUUID().toString();

  @ParameterizedTest
  @MethodSource("types")
  void validatesEveryDataType(DataType type, Object valid, Object invalid) {
    var definition = definition(type, constraints(type));

    assertDoesNotThrow(() -> validate(definition, valid, true));
    var error =
        assertThrows(CommandRejectedException.class, () -> validate(definition, invalid, true));

    assertEquals("KERNEL-422-FIELD-VALUE-INVALID", error.error().code());
  }

  @Test
  void validatesRangeLengthEnumPatternAndReference() {
    assertRejected(
        definition(DataType.NUMBER, constraints(null, null, "0", "10", null, null, null)), -1);
    assertRejected(
        definition(DataType.STRING, constraints(2, 4, null, null, "a+", null, null)), "b");
    assertRejected(
        definition(DataType.ENUM, constraints(null, null, null, null, null, List.of("a"), null)),
        "b");
    assertRejected(definition(DataType.REF, constraints(DataType.REF)), REF, false);
  }

  @Test
  void reportsMissingRequiredField() {
    var definition =
        new FieldDefinition(
            UUID.randomUUID(), "value", true, DataType.STRING, FieldConstraints.empty());

    var error =
        assertThrows(
            CommandRejectedException.class,
            () ->
                FieldValidator.validate(
                    WORKSPACE, Map.of("value", definition), Map.of(), anyRef()));

    assertEquals("KERNEL-422-FIELD-VALUE-INVALID", error.error().code());
  }

  private static Stream<Arguments> types() {
    return Stream.of(
        Arguments.of(DataType.STRING, "text", 1),
        Arguments.of(DataType.TEXT, "long text", false),
        Arguments.of(DataType.INTEGER, 1L, 1.2),
        Arguments.of(DataType.NUMBER, new BigDecimal("1.2"), "1.2"),
        Arguments.of(DataType.BOOLEAN, true, "true"),
        Arguments.of(DataType.DATE, "2026-06-13", "2026-99-13"),
        Arguments.of(DataType.DATETIME, "2026-06-13T12:00:00Z", "2026-06-13"),
        Arguments.of(DataType.ENUM, "a", "b"),
        Arguments.of(DataType.REF, REF, "not-a-uuid"),
        Arguments.of(DataType.JSON, Map.of("a", 1), "json"));
  }

  private static FieldDefinition definition(DataType type, FieldConstraints constraints) {
    return new FieldDefinition(UUID.randomUUID(), "value", false, type, constraints);
  }

  private static FieldConstraints constraints(DataType type) {
    return switch (type) {
      case ENUM -> constraints(null, null, null, null, null, List.of("a"), null);
      case REF -> constraints(null, null, null, null, null, null, "demo_object");
      default -> FieldConstraints.empty();
    };
  }

  private static FieldConstraints constraints(
      Integer minLength,
      Integer maxLength,
      String min,
      String max,
      String pattern,
      List<String> enumValues,
      String refCode) {
    return new FieldConstraints(
        minLength,
        maxLength,
        min == null ? null : new BigDecimal(min),
        max == null ? null : new BigDecimal(max),
        pattern,
        enumValues,
        refCode);
  }

  private static void validate(FieldDefinition definition, Object value, boolean referenceExists) {
    FieldValidator.validate(
        WORKSPACE,
        Map.of(definition.code(), definition),
        Map.of(definition.code(), value),
        (workspace, objectId, type) -> referenceExists);
  }

  private static void assertRejected(FieldDefinition definition, Object value) {
    assertRejected(definition, value, true);
  }

  private static void assertRejected(
      FieldDefinition definition, Object value, boolean referenceExists) {
    var error =
        assertThrows(
            CommandRejectedException.class, () -> validate(definition, value, referenceExists));
    assertEquals("KERNEL-422-FIELD-VALUE-INVALID", error.error().code());
  }

  private static FieldValidator.ReferenceLookup anyRef() {
    return (workspace, objectId, type) -> true;
  }
}
