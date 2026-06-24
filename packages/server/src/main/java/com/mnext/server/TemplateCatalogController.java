package com.mnext.server;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TemplateCatalogController {
  private final JdbcTemplate jdbc;

  public TemplateCatalogController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
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
              version.published_at
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
                    row.getObject("published_at", java.time.OffsetDateTime.class)));
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
        types.stream().limit(20).toList(),
        types.size() > 20);
  }

  private record TemplateVersionRow(
      UUID templateId,
      String code,
      String name,
      UUID templateVersionId,
      int version,
      java.time.OffsetDateTime publishedAt) {}

  public record TemplateCatalogItem(
      UUID templateId,
      String code,
      String name,
      int version,
      int latestPublishedVersion,
      java.time.OffsetDateTime publishedAt,
      String description,
      List<TemplateTypeOverview> typeOverview,
      boolean typeOverviewTruncated) {}

  public record TemplateTypeOverview(String code, String name) {}
}
