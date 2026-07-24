import { Link } from "react-router-dom";

import {
  IconGrid,
  IconSpark,
  UsAvatar,
  UsInput,
  UsMonoTag,
} from "../primitives";
import { ExpressionCreateTrigger } from "../expression/expression-create-trigger";
import { usPaths, type UsFormKind } from "../routes-paths";
import { UsLogo } from "../shell/logo";
import { RoleSwitcher } from "../shell/role-switcher";
import { useChangeSetSnapshot } from "../state/changeset-store";
import { useSessionSnapshot } from "../state/session-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";
import { deriveHomeVm, type HomeSourceTileVm } from "./home-view-model";

export function HomePage() {
  const workspace = useWorkspaceSnapshot();
  const changeSets = useChangeSetSnapshot();
  const session = useSessionSnapshot();
  const vm = deriveHomeVm(workspace, changeSets, session);
  const activityMembers = new Map(
    workspace.members.map((member) => [member.id, member]),
  );

  return (
    <div className="us-home">
      <header className="us-homebar">
        <UsLogo sub={false} />
        <span className="us-homebar__brand">同源</span>
        <span className="us-homebar__space">空间:{vm.workspaceName}</span>
        <span className="us-homebar__spacer" />
        <UsInput
          aria-label="搜索"
          containerClassName="us-homebar__search"
          hotkey="⌘K"
          kind="search"
          placeholder="搜索表达、数据源、字段…"
        />
        <Link className="us-homebar__ai" to={usPaths.import}>
          <IconSpark size={13} />
          AI 导入
        </Link>
        <ExpressionCreateTrigger surface="home" />
        <RoleSwitcher />
      </header>
      <main className="us-home__body">
        <section className="us-home__main">
          <div className="us-home__greeting">
            <strong>早上好,{vm.currentMemberName}</strong>
            <span>
              今天已有 <b>{vm.pendingCount} 项数据变更</b>,{vm.fieldRefCount}{" "}
              处引用全部同步
            </span>
          </div>

          <section className="us-home-section">
            <header>
              <span>表达 WHAT TO SAY</span>
              <UsMonoTag>{vm.expressions.length}</UsMonoTag>
            </header>
            <div className="us-home-exprs">
              {vm.expressions.map((expression) => (
                <Link
                  className="us-home-expr"
                  key={expression.id}
                  to={usPaths.expr(
                    expression.id,
                    expression.defaultForm as UsFormKind,
                  )}
                >
                  <strong>{expression.name}</strong>
                  <span className="us-home-expr__tags">
                    {expression.forms.map((form) => (
                      <UsMonoTag
                        active={form === expression.defaultForm}
                        key={form}
                      >
                        {form.toUpperCase()}
                      </UsMonoTag>
                    ))}
                  </span>
                  <span className="us-home-expr__foot">
                    <UsAvatar
                      label={expression.avatarLabel}
                      member={expression.activityAvatar}
                      size="sm"
                    />
                    {expression.lastActivity}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="us-home-section">
            <header>
              <span>统一数据源 DATA</span>
              <UsMonoTag>{vm.sources.length}</UsMonoTag>
            </header>
            <div className="us-home-sources">
              {vm.sources.map((source) => (
                <SourceTile key={source.code} source={source} />
              ))}
            </div>
          </section>
        </section>

        <aside className="us-home__aside">
          {vm.pendingAiCount > 0 ? (
            <section className="us-home-todo">
              <span className="us-home-todo__kicker">待确认 TODO</span>
              <strong>{vm.pendingAiCount} 项待确认</strong>
              <p>AI 提取的上市日期置信度 74%,需人工确认后写入。</p>
              <Link to={usPaths.import}>去确认</Link>
            </section>
          ) : null}
          <section className="us-home-activity">
            <header>
              <strong>最近变更 ACTIVITY</strong>
              <span>全部</span>
            </header>
            {workspace.activity.slice(0, 5).map((activity) => {
              const member = activityMembers.get(activity.actor);
              return (
                <div className="us-home-activity__item" key={activity.id}>
                  <UsAvatar
                    label={member?.name.slice(0, 1) ?? "?"}
                    member={member?.avatar ?? "ai"}
                    size="sm"
                  />
                  <span>
                    <b>{activity.summary}</b>
                    <small>
                      {activity.tracks.map((track) => (
                        <i data-track={track} key={track}>
                          {track === "data" ? "数据轨" : "表达轨"}
                        </i>
                      ))}
                      <em>{activity.at.slice(11, 16)}</em>
                    </small>
                  </span>
                </div>
              );
            })}
            {workspace.activity.length === 0 ? (
              <p className="us-home-activity__empty">暂无已加载的变更记录。</p>
            ) : null}
            <p>数据源改动(琥珀)与表达改动(蓝灰)同一条流水,可追溯。</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

function SourceTile({ source }: { readonly source: HomeSourceTileVm }) {
  return (
    <Link
      className="us-home-source"
      data-tone={source.tone}
      to={usPaths.source(source.code)}
    >
      <span className="us-home-source__icon">
        <IconGrid size={14} />
      </span>
      <strong>{source.name}</strong>
      <span className="us-data">
        {source.count} 记录 · 被 {source.refCount} 表达引用
      </span>
      <span className="us-home-source__status">{source.status}</span>
    </Link>
  );
}
