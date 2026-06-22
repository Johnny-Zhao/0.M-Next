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
    return jdbc.query(
        """
        SELECT DISTINCT ON (template.id)
          template.id AS template_id,
          template.code,
          template.name,
          version.version
        FROM scene_template template
        JOIN scene_template_version version ON version.template_id = template.id
        WHERE version.status = 'published'
        ORDER BY template.id, version.version DESC
        """,
        (row, index) ->
            new TemplateCatalogItem(
                row.getObject("template_id", UUID.class),
                row.getString("code"),
                row.getString("name"),
                row.getInt("version")));
  }

  public record TemplateCatalogItem(UUID templateId, String code, String name, int version) {}
}
