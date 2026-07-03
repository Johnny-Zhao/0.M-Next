package com.mnext.engines.output;

import java.util.List;
import java.util.Map;

public record OutputTemplate(
    String objectType, List<String> fieldOrder, SectionMapping sectionMapping) {
  public OutputTemplate {
    fieldOrder = fieldOrder == null ? List.of() : List.copyOf(fieldOrder);
  }

  public OutputTemplate(String objectType, List<String> fieldOrder) {
    this(objectType, fieldOrder, null);
  }

  public record SectionMapping(
      Map<Integer, Integer> headingLevels,
      Map<String, String> fieldRoles,
      Map<String, String> fieldLabels) {
    public SectionMapping {
      headingLevels = headingLevels == null ? Map.of() : Map.copyOf(headingLevels);
      fieldRoles = fieldRoles == null ? Map.of() : Map.copyOf(fieldRoles);
      fieldLabels = fieldLabels == null ? Map.of() : Map.copyOf(fieldLabels);
    }

    public SectionMapping(Map<Integer, Integer> headingLevels, Map<String, String> fieldRoles) {
      this(headingLevels, fieldRoles, Map.of());
    }
  }
}
