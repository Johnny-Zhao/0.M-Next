package com.mnext.engines.exchange.sysml;

import java.util.List;
import java.util.Map;

public record SysmlXmiModel(
    List<String> appliedProfiles,
    List<SysmlPackage> packages,
    List<SysmlClass> classes,
    List<SysmlAssociation> associations,
    List<SysmlDependency> dependencies,
    List<SysmlExternalReference> externalReferences) {
  public SysmlXmiModel {
    appliedProfiles = appliedProfiles == null ? List.of() : List.copyOf(appliedProfiles);
    packages = packages == null ? List.of() : List.copyOf(packages);
    classes = classes == null ? List.of() : List.copyOf(classes);
    associations = associations == null ? List.of() : List.copyOf(associations);
    dependencies = dependencies == null ? List.of() : List.copyOf(dependencies);
    externalReferences = externalReferences == null ? List.of() : List.copyOf(externalReferences);
  }

  public SysmlXmiModel(
      List<String> appliedProfiles,
      List<SysmlPackage> packages,
      List<SysmlClass> classes,
      List<SysmlAssociation> associations,
      List<SysmlDependency> dependencies) {
    this(appliedProfiles, packages, classes, associations, dependencies, List.of());
  }

  public SysmlXmiModel(List<SysmlClass> classes, List<SysmlAssociation> associations) {
    this(List.of(), List.of(), classes, associations, List.of(), List.of());
  }

  public record SysmlClass(
      String id, String name, String stereotype, String umlType, List<SysmlProperty> properties) {
    public SysmlClass {
      properties = properties == null ? List.of() : List.copyOf(properties);
    }

    public SysmlClass(String id, String name, String stereotype, List<SysmlProperty> properties) {
      this(id, name, stereotype, "uml:Class", properties);
    }
  }

  public record SysmlPackage(String id, String name) {}

  public record SysmlProperty(
      String id, String name, String type, String value, String kind, String aggregation) {
    public SysmlProperty(String id, String name, String type, String value) {
      this(id, name, type, value, "property", "");
    }
  }

  public record SysmlAssociation(
      String id,
      String stereotype,
      String sourceId,
      String targetId,
      String kind,
      Map<String, String> fields) {
    public SysmlAssociation {
      fields = fields == null ? Map.of() : Map.copyOf(fields);
    }

    public SysmlAssociation(
        String id,
        String stereotype,
        String sourceId,
        String targetId,
        Map<String, String> fields) {
      this(id, stereotype, sourceId, targetId, "association", fields);
    }
  }

  public record SysmlDependency(
      String id, String stereotype, String sourceId, String targetId, String kind) {}

  public record SysmlExternalReference(
      String id, String sourceId, String href, String stereotype, String kind) {}
}
