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
      Map<String, String> fieldLabels,
      List<RelationTable> relationTables) {
    public SectionMapping {
      headingLevels = headingLevels == null ? Map.of() : Map.copyOf(headingLevels);
      fieldRoles = fieldRoles == null ? Map.of() : Map.copyOf(fieldRoles);
      fieldLabels = fieldLabels == null ? Map.of() : Map.copyOf(fieldLabels);
      relationTables = relationTables == null ? List.of() : List.copyOf(relationTables);
    }

    public SectionMapping(Map<Integer, Integer> headingLevels, Map<String, String> fieldRoles) {
      this(headingLevels, fieldRoles, Map.of(), List.of());
    }

    public SectionMapping(
        Map<Integer, Integer> headingLevels,
        Map<String, String> fieldRoles,
        Map<String, String> fieldLabels) {
      this(headingLevels, fieldRoles, fieldLabels, List.of());
    }

    public record RelationTable(String relationType, String title, List<RelationColumn> columns) {
      public RelationTable {
        relationType = relationType == null ? "" : relationType.trim();
        title = title == null ? "" : title.trim();
        columns = columns == null ? List.of() : List.copyOf(columns);
      }
    }

    public record RelationColumn(String label, String fieldCode, List<String> relationPath) {
      public RelationColumn {
        label = label == null ? "" : label.trim();
        fieldCode = fieldCode == null ? "" : fieldCode.trim();
        relationPath = relationPath == null ? List.of() : List.copyOf(relationPath);
      }
    }
  }
}
