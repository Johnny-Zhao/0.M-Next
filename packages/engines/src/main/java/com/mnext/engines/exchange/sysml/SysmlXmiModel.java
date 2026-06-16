package com.mnext.engines.exchange.sysml;

import java.util.List;
import java.util.Map;

public record SysmlXmiModel(List<SysmlClass> classes, List<SysmlAssociation> associations) {
  public SysmlXmiModel {
    classes = classes == null ? List.of() : List.copyOf(classes);
    associations = associations == null ? List.of() : List.copyOf(associations);
  }

  public record SysmlClass(
      String id, String name, String stereotype, List<SysmlProperty> properties) {
    public SysmlClass {
      properties = properties == null ? List.of() : List.copyOf(properties);
    }
  }

  public record SysmlProperty(String id, String name, String type, String value) {}

  public record SysmlAssociation(
      String id, String stereotype, String sourceId, String targetId, Map<String, String> fields) {
    public SysmlAssociation {
      fields = fields == null ? Map.of() : Map.copyOf(fields);
    }
  }
}
