package com.mnext.engines.exchange.sysml;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class SysmlManifestMapping {
  private static final String GENERIC_OBJECT_TYPE = "uml_class";
  private static final String GENERIC_RELATION_TYPE = "uml_association";
  private static final SysmlManifestMapping DEFAULT = loadDefault();

  private final Map<String, String> stereotypeToObjectType;
  private final Map<String, String> objectTypeToStereotype;
  private final Set<String> relationTypes;

  private SysmlManifestMapping(
      Map<String, String> stereotypeToObjectType,
      Map<String, String> objectTypeToStereotype,
      Set<String> relationTypes) {
    this.stereotypeToObjectType = Map.copyOf(stereotypeToObjectType);
    this.objectTypeToStereotype = Map.copyOf(objectTypeToStereotype);
    this.relationTypes = Set.copyOf(relationTypes);
  }

  static SysmlManifestMapping get() {
    return DEFAULT;
  }

  String objectType(String stereotype) {
    var normalized = normalize(stereotype);
    if (normalized.isBlank()) return GENERIC_OBJECT_TYPE;
    return stereotypeToObjectType.getOrDefault(normalized, GENERIC_OBJECT_TYPE);
  }

  String stereotype(String objectType, Map<String, Object> fields) {
    var explicit = fields == null ? null : fields.get("uml_stereotype");
    if (explicit != null && !String.valueOf(explicit).isBlank()) return String.valueOf(explicit);
    return objectTypeToStereotype.getOrDefault(objectType, "");
  }

  boolean knownStereotype(String stereotype) {
    return stereotypeToObjectType.containsKey(normalize(stereotype));
  }

  String relationType(String umlKind, String stereotype) {
    var preferred = relationCode(umlKind, stereotype);
    if (relationTypes.contains(preferred)) return preferred;
    return relationTypes.contains(GENERIC_RELATION_TYPE) ? GENERIC_RELATION_TYPE : preferred;
  }

  private static SysmlManifestMapping loadDefault() {
    for (var path : manifestCandidates()) {
      if (!Files.exists(path)) continue;
      try {
        return fromManifest(new ObjectMapper().readTree(path.toFile()));
      } catch (IOException failure) {
        throw new IllegalStateException("SysML manifest cannot be read: " + path, failure);
      }
    }
    return fallback();
  }

  private static SysmlManifestMapping fromManifest(JsonNode manifest) {
    var stereotypes = new LinkedHashMap<String, String>();
    var objectTypes = new LinkedHashMap<String, String>();
    for (var node : manifest.path("objectTypes")) {
      var code = text(node, "code");
      var stereotype = stereotypeFromObjectType(code, text(node, "name"));
      if (stereotype.isBlank()) continue;
      stereotypes.put(normalize(stereotype), code);
      objectTypes.put(code, stereotype);
    }
    var relations = new java.util.LinkedHashSet<String>();
    for (var node : manifest.path("relations")) {
      var code = text(node, "code");
      if (!code.isBlank()) relations.add(code);
    }
    if (relations.isEmpty()) relations.add(GENERIC_RELATION_TYPE);
    if (!stereotypes.containsKey("block")) stereotypes.put("block", "sysml_block");
    if (!stereotypes.containsKey("requirement"))
      stereotypes.put("requirement", "sysml_requirement");
    objectTypes.putIfAbsent("sysml_block", "Block");
    objectTypes.putIfAbsent("sysml_requirement", "requirement");
    return new SysmlManifestMapping(stereotypes, objectTypes, relations);
  }

  private static String stereotypeFromObjectType(String code, String name) {
    var value = (name + " " + code).toLowerCase(Locale.ROOT);
    if (value.contains("requirement")) return "requirement";
    if (value.contains("block")) return "Block";
    return "";
  }

  private static String relationCode(String umlKind, String stereotype) {
    var normalized = normalize(stereotype);
    if (!normalized.isBlank()) return normalized;
    var kind = normalize(umlKind);
    return kind.isBlank() || "association".equals(kind) ? GENERIC_RELATION_TYPE : kind;
  }

  private static String text(JsonNode node, String field) {
    var value = node.path(field).asText("");
    return value == null ? "" : value.trim();
  }

  static String normalize(String value) {
    if (value == null) return "";
    return value.replace("«", "").replace("»", "").replace("SysML::", "").trim().toLowerCase();
  }

  private static Path[] manifestCandidates() {
    return new Path[] {
      Path.of("packages", "domains", "sysml", "profile.manifest.json"),
      Path.of("..", "domains", "sysml", "profile.manifest.json"),
      Path.of("..", "..", "packages", "domains", "sysml", "profile.manifest.json").normalize()
    };
  }

  private static SysmlManifestMapping fallback() {
    return new SysmlManifestMapping(
        Map.of("block", "sysml_block", "requirement", "sysml_requirement"),
        Map.of("sysml_block", "Block", "sysml_requirement", "requirement"),
        Set.of(GENERIC_RELATION_TYPE));
  }
}
