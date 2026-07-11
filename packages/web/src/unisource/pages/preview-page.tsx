import { useState } from "react";

import {
  IconSpark,
  UsAiBadge,
  UsAvatar,
  UsAvatarGroup,
  UsButton,
  UsDiffBadge,
  UsDrawer,
  UsInput,
  UsModal,
  UsMonoTag,
  UsPanel,
  UsSegmented,
  UsStatusPill,
  UsSyncDot,
  UsUnderlineTabs,
  pushToast,
} from "../primitives";
import { UsInspector } from "../shell/inspector";
import { FullLayout } from "../shell/layouts";
import { WorkspaceHeader } from "../shell/workspace-header";
import { PlayBar } from "../sim/play-bar";
import { MatrixRecordCard } from "../matrix/record-card";
import { PluginCard } from "../plugins/plugin-card";
import { changeSetStore, useChangeSetSnapshot } from "../state/changeset-store";
import { useValidationSnapshot } from "../state/validation-store";
import { useWorkspaceSnapshot } from "../state/workspace-store";

/** Token 色板预览:名称字符串 → var() 引用,不出现色值字面量。 */
const COLOR_TOKENS: ReadonlyArray<[name: string, use: string]> = [
  ["--us-ink", "正文/强调按钮/Toast 底"],
  ["--us-paper", "屏底/卡片"],
  ["--us-canvas", "工作区底"],
  ["--us-sidebar", "侧栏"],
  ["--us-border", "边框(次级 --us-border-soft)"],
  ["--us-text-muted", "辅助文字(弱 --us-text-faint)"],
  ["--us-primary", "数据/引用/选中/确认(文字 --us-primary-deep)"],
  ["--us-change", "变更/待确认/运行中(文字 --us-change-text)"],
  ["--us-danger", "删除/错误/悬空"],
  ["--us-gold", "深底上的 AI/高亮"],
];

function Swatch({ name, use }: { name: string; use: string }) {
  return (
    <div className="us-swatch">
      <span
        className="us-swatch__chip"
        style={{ background: `var(${name})` }}
      />
      <span className="us-swatch__name">{name}</span>
      <span className="us-swatch__use">{use}</span>
    </div>
  );
}

/** /us/preview — P0 组件预览页(Story/demo):底座验收基准。 */
export function PreviewPage() {
  const [seg, setSeg] = useState("what");
  const [tab, setTab] = useState("props");
  const [net, setNet] = useState("normal");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const workspace = useWorkspaceSnapshot();
  const validation = useValidationSnapshot();
  const changeSets = useChangeSetSnapshot();
  const pending = changeSets.changeSets.filter(
    (changeSet) => changeSet.status === "pending",
  );
  const aiChangeSet = pending.find((changeSet) => changeSet.source === "ai");

  return (
    <FullLayout
      chrome={{
        breadcrumb: [{ label: "开发" }, { label: "组件预览" }],
        breadcrumbTail: <span className="us-data">PREVIEW · P0</span>,
        sync: { state: "ok", label: "Token 驱动 · 零散写色值" },
      }}
    >
      <div className="us-preview">
        <UsPanel title="设计 Token" kicker="TOKENS · 交接规格 §03">
          {COLOR_TOKENS.map(([name, use]) => (
            <Swatch key={name} name={name} use={use} />
          ))}
          <div className="us-preview__note">
            字体:界面 <span className="us-data">font.ui</span> · 数据一律{" "}
            <span className="us-data">¥1,199 · 2026-08-18 · IP65</span>(
            <span className="us-data">font.data</span>,无例外)· 文档正文
            font.doc(衬线,P1 文档页启用)。
          </div>
        </UsPanel>

        <UsPanel title="数据模型" kicker="DATA MODEL">
          <div className="us-preview__row">
            <UsMonoTag active>{workspace.objects.length} OBJECTS</UsMonoTag>
            <UsMonoTag tone="primary">
              {workspace.relations.length} RELATIONS
            </UsMonoTag>
            <UsMonoTag tone="change">{pending.length} CHANGESETS</UsMonoTag>
            <UsMonoTag>{validation.results.length} CHECKS</UsMonoTag>
          </div>
          <div className="us-preview__note">
            这些数字来自 seed/demo-seed.ts → workspace-store /
            changeset-store;侧栏与页面 chrome 也从同一份 snapshot 读取。
          </div>
          <div className="us-preview__row">
            <UsButton
              disabled={!aiChangeSet}
              variant="primary"
              onClick={() => {
                if (!aiChangeSet) return;
                const result = changeSetStore.acceptItems(
                  aiChangeSet.id,
                  aiChangeSet.items.map((item) => item.id),
                );
                pushToast({
                  title: result.ok ? "确认写入 ¥1,199 演示完成" : result.reason,
                  desc: result.ok
                    ? "AI 变更集已通过同一写路径落库,待确认数已减少。"
                    : undefined,
                });
              }}
            >
              确认写入 ¥1,199 演示
            </UsButton>
          </div>
        </UsPanel>

        <UsPanel title="按钮" kicker="BUTTON">
          <div className="us-preview__row">
            <UsButton variant="primary">主操作</UsButton>
            <UsButton variant="emphasis">强调</UsButton>
            <UsButton>次操作</UsButton>
            <UsButton variant="danger">危险</UsButton>
            <UsButton variant="ghost">绿字 ghost</UsButton>
            <UsButton variant="primary" disabled>
              禁用
            </UsButton>
            <UsButton variant="primary" size="sm">
              小号 sm
            </UsButton>
            <UsButton size="sm" icon={<IconSpark size={12} />}>
              AI 导入
            </UsButton>
          </div>
          <div className="us-preview__note">
            危险按钮仅用于「删除数据源记录」类全库动作;「移除出视图」用次操作。
          </div>
        </UsPanel>

        <div className="us-preview__grid">
          <UsPanel title="输入框" kicker="INPUT">
            <div
              className="us-preview__row"
              style={{ flexDirection: "column", alignItems: "stretch" }}
            >
              <UsInput placeholder="普通文本输入…" aria-label="示例输入" />
              <UsInput
                kind="search"
                placeholder="搜索表达、数据源、字段…"
                hotkey="⌘K"
                aria-label="搜索"
              />
              <UsInput
                data
                defaultValue="DL-S3-2026"
                aria-label="数据输入(等宽)"
              />
              <UsInput placeholder="禁用态" disabled aria-label="禁用输入" />
            </div>
          </UsPanel>

          <UsPanel title="页签" kicker="SEGMENTED · TABS">
            <div
              className="us-preview__row"
              style={{ flexDirection: "column", alignItems: "flex-start" }}
            >
              <UsSegmented
                aria-label="表达/数据源"
                items={[
                  { key: "what", label: "表达 WHAT" },
                  { key: "data", label: "数据源 DATA" },
                ]}
                value={seg}
                onChange={setSeg}
              />
              <UsSegmented
                aria-label="网络"
                items={[
                  { key: "normal", label: "正常" },
                  { key: "weak", label: "弱网" },
                  { key: "offline", label: "断网", disabled: true },
                ]}
                value={net}
                onChange={setNet}
              />
              <UsUnderlineTabs
                aria-label="检查器"
                items={[
                  { key: "props", label: "属性" },
                  { key: "style", label: "样式" },
                  { key: "versions", label: "版本" },
                ]}
                value={tab}
                onChange={setTab}
                aside="已选 3"
              />
            </div>
          </UsPanel>
        </div>

        <UsPanel title="徽标" kicker="BADGES">
          <div className="us-preview__row">
            <UsStatusPill tone="sale">在售</UsStatusPill>
            <UsStatusPill tone="presale">预售</UsStatusPill>
            <UsStatusPill tone="dev">研发中</UsStatusPill>
            <UsStatusPill tone="eol">停产</UsStatusPill>
            <UsDiffBadge op="add" />
            <UsDiffBadge op="change" />
            <UsDiffBadge op="delete" />
            <UsDiffBadge op="skip" />
            <UsAiBadge />
            <UsMonoTag>GRID</UsMonoTag>
            <UsMonoTag active>DOC</UsMonoTag>
            <UsMonoTag tone="primary">符合约束 6</UsMonoTag>
            <UsMonoTag tone="change">改 2</UsMonoTag>
          </div>
          <div className="us-preview__note">
            状态胶囊 = 数据枚举值;方角 增/改/删 = 数据源 diff
            动作,色义固定不得混用。
          </div>
        </UsPanel>

        <UsPanel title="头像 / 同步灯" kicker="AVATAR · SYNC">
          <div className="us-preview__row">
            <UsAvatarGroup>
              <UsAvatar member="wang" label="王" title="王芸 · 产品" />
              <UsAvatar member="li" label="李" title="李晓 · 研发" />
              <UsAvatar member="chen" label="陈" title="陈默 · 渠道运营" />
              <UsAvatar member="zhou" label="周" title="周然 · 法务" />
              <UsAvatar member="ai" label="AI" title="同源 AI · 代理" />
            </UsAvatarGroup>
            <UsSyncDot state="ok">已同步 · 刚刚</UsSyncDot>
            <UsSyncDot state="change">刚刚同步 2 处引用</UsSyncDot>
            <UsSyncDot state="danger">冲突:缓存 ≠ 权威</UsSyncDot>
            <UsSyncDot state="offline">离线 · 改动已排队</UsSyncDot>
          </div>
        </UsPanel>

        <UsPanel title="浮层" kicker="DRAWER · MODAL · TOAST">
          <div className="us-preview__row">
            <UsButton onClick={() => setDrawerOpen(true)}>
              打开 Drawer(360)
            </UsButton>
            <UsButton onClick={() => setModalOpen(true)}>打开 Modal</UsButton>
            <UsButton
              variant="primary"
              onClick={() =>
                pushToast({
                  title: "「售价」已更新 → ¥1,199",
                  desc: "《智能门锁 S3 产品规格书》中 2 处引用已同步。",
                  actions: [
                    { label: "查看变更" },
                    { label: "撤销", tone: "dim" },
                  ],
                })
              }
            >
              触发 Toast(含撤销 8s)
            </UsButton>
            <UsButton onClick={() => pushToast({ title: "已保存视图布局" })}>
              触发 Toast(5s)
            </UsButton>
          </div>
        </UsPanel>

        <UsPanel
          title="WorkspaceHeader"
          kicker="TOPBAR 48 / 52"
          bodyClassName="us-preview__row"
          style={{ overflow: "hidden" }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid var(--us-border)",
              borderRadius: "var(--us-radius-panel)",
              overflow: "hidden",
            }}
          >
            <WorkspaceHeader
              breadcrumb={[{ label: "统一数据源" }, { label: "产品规格库" }]}
              sync={{ state: "ok", label: "已同步 · 3 篇关联文档" }}
              people={[
                { member: "wang", label: "王" },
                { member: "li", label: "李" },
              ]}
            />
            <WorkspaceHeader
              variant="full"
              breadcrumb={[{ label: "设置" }, { label: "插件中心" }]}
              breadcrumbTail={<span className="us-data">PLUGINS</span>}
              actions={<UsButton variant="emphasis">提交插件</UsButton>}
            />
          </div>
        </UsPanel>

        <UsPanel
          title="Inspector 容器"
          kicker="INSPECTOR 316"
          bodyClassName="us-preview__row"
        >
          <div
            style={{
              marginLeft: "auto",
              height: 300,
              display: "flex",
              border: "1px solid var(--us-border)",
              borderRadius: "var(--us-radius-panel)",
              overflow: "hidden",
            }}
          >
            <UsInspector
              aside={<span className="us-data">已选 3</span>}
              tabs={[
                {
                  key: "props",
                  label: "属性",
                  content: <span>P2:绑定记录 + 显示字段。</span>,
                },
                {
                  key: "style",
                  label: "样式",
                  content: <span>P2:字体/色板/圆角/显隐。</span>,
                },
                {
                  key: "versions",
                  label: "版本",
                  content: <span>P2:数据轨/视图轨版本流。</span>,
                },
              ]}
            />
          </div>
        </UsPanel>

        <UsPanel title="P2 组件" kicker="SLOT · PLAY · MATRIX · ANA · PLUGIN">
          <div className="us-preview__p2">
            {(["instantiated", "activated", "violated"] as const).map(
              (state) => (
                <article
                  className="us-slot-card"
                  data-state={state}
                  key={state}
                >
                  <header>
                    <span>{state === "activated" ? "主板槽位" : "CPU"}</span>
                    <UsMonoTag
                      tone={state === "violated" ? "change" : "primary"}
                    >
                      {state}
                    </UsMonoTag>
                  </header>
                  <strong>
                    {state === "activated" ? "抽象:主板槽位" : "Core Ultra"}
                  </strong>
                  <p className="us-data">硬件产品库 · preview</p>
                </article>
              ),
            )}
          </div>
          <PlayBar
            duration={10}
            loop
            onLoopChange={() => undefined}
            onPlayingChange={() => undefined}
            onSpeedChange={() => undefined}
            onStop={() => undefined}
            playing
            playhead={4}
            speed={1}
          />
          <div className="us-preview__p2">
            <MatrixRecordCard
              canDrag
              card={{
                objectId: "prod-s3",
                name: "门锁 S3",
                columnValue: "预售",
                rowValue: "王芸",
                priceText: "¥1,199",
                docRefs: 3,
                dim: false,
              }}
              onClick={() => undefined}
              onDragStart={() => undefined}
            />
            <div className="us-ana-factor">
              <span>配件占比下降</span>
              <i data-tone="change" style={{ width: "72%" }} />
              <strong className="us-data">-3.4%</strong>
            </div>
            <PluginCard
              card={{
                id: "plug-preview",
                name: "三维架构图",
                meta: "v2.3 · 同源官方",
                tagline: "把部件层级描述为三维装配视图。",
                industry: "制造业",
                formsCount: 2,
                installed: true,
                enabled: true,
                updateTo: "2.4",
                beta: false,
                selected: true,
              }}
              onInstall={() => undefined}
              onSelect={() => undefined}
              onUpdate={() => undefined}
            />
          </div>
        </UsPanel>
      </div>

      <UsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="同源 AI"
        headerExtra={<span className="us-data">COPILOT</span>}
      >
        <span style={{ color: "var(--us-text-muted)", fontSize: 12 }}>
          P1:AI 对话抽屉(气泡 + 增/改操作卡 + AI 指令条)。
        </span>
      </UsDrawer>

      <UsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="删除数据源记录?"
        footer={
          <>
            <UsButton onClick={() => setModalOpen(false)}>取消</UsButton>
            <UsButton variant="danger" onClick={() => setModalOpen(false)}>
              删除(占位)
            </UsButton>
          </>
        }
      >
        DeleteConfirmModal 正式稿未设计(交接规格
        08-①):需含受影响表达清单、输入名称确认与不可撤销声明,补稿后在本容器上实现。
      </UsModal>
    </FullLayout>
  );
}
