package com.mnext.server;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TemplateCatalogController {
  private static final List<String> UNCATEGORIZED = List.of("未分类");
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  public TemplateCatalogController(JdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  @GetMapping("/views/templates")
  public List<TemplateCatalogItem> templates() {
    var rows =
        jdbc.query(
            """
            SELECT DISTINCT ON (template.id)
              template.id AS template_id,
              template.code,
              template.name,
              version.id AS template_version_id,
              version.version,
              version.published_at,
              version.tags::text AS tags
            FROM scene_template template
            JOIN scene_template_version version ON version.template_id = template.id
            WHERE version.status = 'published'
            ORDER BY template.id, version.version DESC
            """,
            (row, index) ->
                new TemplateVersionRow(
                    row.getObject("template_id", UUID.class),
                    row.getString("code"),
                    row.getString("name"),
                    row.getObject("template_version_id", UUID.class),
                    row.getInt("version"),
                    row.getObject("published_at", java.time.OffsetDateTime.class),
                    row.getString("tags")));
    return rows.stream().map(this::item).toList();
  }

  private TemplateCatalogItem item(TemplateVersionRow row) {
    var types =
        jdbc.query(
            """
            SELECT code, name
            FROM object_type
            WHERE template_version_id = ?
            ORDER BY code
            LIMIT 21
            """,
            (result, index) -> new TemplateTypeOverview(result.getString(1), result.getString(2)),
            row.templateVersionId());
    return new TemplateCatalogItem(
        row.templateId(),
        row.code(),
        row.name(),
        row.version(),
        row.version(),
        row.publishedAt(),
        null,
        tags(row.tags()),
        types.stream().limit(20).toList(),
        types.size() > 20);
  }

  private TemplateTags tags(String value) {
    if (value == null || value.isBlank()) {
      return uncategorizedTags();
    }
    try {
      Map<String, List<String>> tags = mapper.readValue(value, new TypeReference<>() {});
      return new TemplateTags(
          tagValues(tags.get("industry")),
          tagValues(tags.get("profession")),
          tagValues(tags.get("scenario")));
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      return uncategorizedTags();
    }
  }

  private TemplateTags uncategorizedTags() {
    return new TemplateTags(UNCATEGORIZED, UNCATEGORIZED, UNCATEGORIZED);
  }

  private List<String> tagValues(List<String> values) {
    if (values == null) return UNCATEGORIZED;
    var cleaned = values.stream().filter(value -> value != null && !value.isBlank()).toList();
    return cleaned.isEmpty() ? UNCATEGORIZED : cleaned;
  }

  private record TemplateVersionRow(
      UUID templateId,
      String code,
      String name,
      UUID templateVersionId,
      int version,
      java.time.OffsetDateTime publishedAt,
      String tags) {}

  public record TemplateTags(
      List<String> industry, List<String> profession, List<String> scenario) {}

  public record TemplateCatalogItem(
      UUID templateId,
      String code,
      String name,
      int version,
      int latestPublishedVersion,
      java.time.OffsetDateTime publishedAt,
      String description,
      TemplateTags tags,
      List<TemplateTypeOverview> typeOverview,
      boolean typeOverviewTruncated) {}

  public record TemplateTypeOverview(String code, String name) {}
}
