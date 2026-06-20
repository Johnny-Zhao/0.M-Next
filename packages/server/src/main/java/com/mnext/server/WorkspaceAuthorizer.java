package com.mnext.server;

import com.mnext.kernel.api.CommandError;
import com.mnext.kernel.api.CommandRejectedException;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class WorkspaceAuthorizer {
  private final JdbcTemplate jdbc;

  public WorkspaceAuthorizer(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void require(String actorId, UUID workspaceId, Action action) {
    if (!governed(workspaceId)) return;
    var actor = actor(actorId);
    var userStatus = userStatus(actor);
    if (!"ACTIVE".equals(userStatus)) {
      throw rejected("AUTH-401-UNKNOWN-ACTOR", "操作者不存在或已停用", "使用有效账号重新发起请求");
    }
    var role = memberRole(workspaceId, actor);
    if (role == null || Role.valueOf(role).level < action.minimumRole.level) {
      throw rejected("AUTH-403-FORBIDDEN", "当前角色无权执行该操作", "联系工作空间管理员调整角色");
    }
  }

  private boolean governed(UUID workspaceId) {
    var count =
        jdbc.queryForObject(
            "SELECT count(*) FROM workspace_member WHERE workspace_id = ?",
            Integer.class,
            workspaceId);
    return count != null && count > 0;
  }

  private UUID actor(String actorId) {
    try {
      return actorId == null || actorId.isBlank() ? null : UUID.fromString(actorId);
    } catch (IllegalArgumentException failure) {
      throw rejected("AUTH-401-UNKNOWN-ACTOR", "操作者不存在或已停用", "使用有效账号重新发起请求");
    }
  }

  private String userStatus(UUID actor) {
    if (actor == null) return null;
    var statuses =
        jdbc.query(
            "SELECT status FROM app_user WHERE id = ?", (row, index) -> row.getString(1), actor);
    return statuses.isEmpty() ? null : statuses.getFirst();
  }

  private String memberRole(UUID workspaceId, UUID actor) {
    var roles =
        jdbc.query(
            "SELECT role FROM workspace_member WHERE workspace_id = ? AND user_id = ?",
            (row, index) -> row.getString(1),
            workspaceId,
            actor);
    return roles.isEmpty() ? null : roles.getFirst();
  }

  private static CommandRejectedException rejected(String code, String message, String suggestion) {
    return new CommandRejectedException(new CommandError(code, message, Map.of(), suggestion));
  }

  public enum Action {
    READ(Role.VIEWER),
    WRITE_DATA(Role.AUTHOR),
    REVIEW(Role.REVIEWER),
    GOVERN(Role.ADMIN);

    private final Role minimumRole;

    Action(Role minimumRole) {
      this.minimumRole = minimumRole;
    }
  }

  public enum Role {
    VIEWER(1),
    AUTHOR(2),
    REVIEWER(3),
    ADMIN(4);

    private final int level;

    Role(int level) {
      this.level = level;
    }
  }
}
