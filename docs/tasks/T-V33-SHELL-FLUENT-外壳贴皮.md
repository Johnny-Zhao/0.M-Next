# T-V33-SHELL-FLUENT — 外壳屏 Fluent 贴皮(登录 / 项目首页 / 新建向导 / 工作台外壳)

蓝本:`docs/设计落地-Fluent界面与令牌.md` + 像素参考 `docs/design/M-Next 首页.dc.html`、`docs/design/M-Next 工作台.dc.html`。
**packages/web 域,纯前端换肤,零后端/契约。** 前置:main(已含 SKIN-TOKENS 令牌)。
定位:把"外壳"四块——登录、项目首页、新建向导、工作台 chrome——从现在的素白骨架,贴成蓝本里的 Fluent 浅色长相。**这张对"整体像原型"贡献最大。**

## 现状(先验证)
- 外壳已存在、功能可用,只是**样式素**:
  - `home/login.tsx`(M-Next + 账号/密码 + SSO 占位)、`home/project-list.tsx`(项目卡网格 + 搜索 + 新建)、`home/new-project-wizard.tsx`(向导)、`home/home.css`(**仍是硬编码色 `#ffffff`/`#d7dde7`/`#1677ff` 等**)。
  - 工作台 chrome 在 `workbench/workbench.tsx`(顶栏:返回项目 / 工作空间下拉 / 对象类型 / 关系类型 / 根对象 / 刷新 / 生成文档;视图标签 图·表格·矩阵·文档;主题切换 `theme.ts`),样式多在 `styles.css`。
- 令牌 `--mn-*` 已在 `tokens.css`(SKIN-TOKENS 已合)。本卡**只把外壳 CSS 改为引用令牌 + 贴近 dc.html 版式**,不动任何功能/数据逻辑/dockview 布局机制。

## 范围(纯 CSS / className 调整,逐块对照 dc.html)
- **A. 登录**(对 `首页.dc.html` 登录态):居中单卡(不是现在的两列);标题 `M-Next` + 副标 `数据驱动的工程建模平台`;账号/密码输入用 `--mn-surface`/`--mn-border`/`--mn-ink`;主按钮"进入项目"用 `--mn-accent`;"SSO/企业入口 待接入"为次要禁用态。保留现有 default/readonly 行为。
- **B. 项目首页**(对 `首页.dc.html`):顶部 `M-Next` + 右上"新建项目"主按钮;搜索框;项目卡网格——卡片显示 名称 / 所属插件标签 / 我的角色 / **规则健康度圆点(红黄绿,用 `--mn-bad/warn/ok`)** / 更新时间;空态卡。卡片 hover/focus 用 `--mn-accent-ring`。
- **C. 新建向导**(对 `首页.dc.html` 新建弹窗):三步条(命名→选插件→基础配置)贴 Fluent;步骤 pill 当前态用 `--mn-accent-bg/bd`;"起步方式"卡片用 surface + 选中描边。保留现有三步逻辑与 `/views/templates` 接入。
- **D. 工作台 chrome**(对 `工作台.dc.html`):顶栏底色 `--mn-panel`、描边 `--mn-border`;按钮/下拉/输入贴 Fluent;视图标签(图/表格/矩阵/文档)激活态用 `--mn-accent`;右上"生成文档/导出"主按钮;亮/暗切换可见。**dockview 的停靠机制不重写,只换皮。**

## 封闭文件清单
**修改**:`home/home.css`、`styles.css`(外壳/chrome 相关选择器),按需 `home/login.tsx`/`project-list.tsx`/`new-project-wizard.tsx`/`workbench.tsx` 仅做 **className/结构微调以贴版式**(如登录两列→居中卡、卡片加圆点元素)。
**零碰**:后端、契约、迁移、`packages/views`、画布节点渲染(`object-node.tsx` 归 SKIN-NODE)、命令/数据逻辑、dockview 停靠机制。

## 红线 / 门禁
- 纯前端换肤 + 版式贴近;**零后端/契约**;**不改功能与数据逻辑**(登录/新建/打开工作空间/视图切换照常)。
- 规则健康度圆点 = 颜色 + 形状/数字双编码,不只靠颜色。
- 不新增依赖;`corepack pnpm verify` 全绿;亮/暗双主题可用;对现有行为零回归。
- 分支 `feat/T-V33-shell-fluent` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 登录/首页/新建向导/工作台外壳四块观感贴近 `docs/design/*.dc.html`(Fluent 浅色、`#5B5FC7` 强调、Segoe/Cascadia 字体)。
2. 项目卡有红黄绿健康度圆点;视图标签激活态清晰;主按钮强调色。
3. 暗色可切;无功能回归;无后端/契约 diff。

## 跟进(本卡不做)
SKIN-NODE(画布节点全状态)、SKIN-WIDGETS、SKIN-EDGE。插件库管理屏(若需)另开卡。
