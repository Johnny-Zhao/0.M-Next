# 设计落地 — Fluent 界面与令牌(基于 Claude Design 导出)

> 来源:`BS工具UI风格概念.zip`(Claude Design 导出:4 屏 dc.html + 2 份规格 md + 渲染图)。基调 = Microsoft Office / Fluent 浅色,品牌主色 `#5B5FC7`(= 现有 `--mnext-brand`),红黄绿语义对规则灯。亮/暗双主题。
> **把 4 个 dc.html 放进 `docs/design/` 作 Codex 的像素参考**(工作台.dc.html / 户型工作台.dc.html / 首页.dc.html / 图元风格概念.dc.html)。

## 一、设计令牌(写入 `packages/web/src/tokens.css`,浅色默认)
```css
:root{
  /* 强调色(品牌紫;另有 蓝 #0F6CBD / 青 #0E7C7B 两套可选主题) */
  --mn-accent:#5B5FC7; --mn-accent-d:#4549A0; --mn-accent-bg:#EEEEFB; --mn-accent-bd:#C4C6EE; --mn-accent-ring:rgba(91,95,199,.28);
  /* 背景 / 表面 */
  --mn-bg:#EEEDEB; --mn-bg-1:#F3F2F0; --mn-surface:#FFFFFF; --mn-surface-2:#F4F3F1; --mn-surface-3:#ECEAE7; --mn-panel:#FAF9F8;
  /* 边框 / 网格 */
  --mn-border:#E6E3E1; --mn-border-2:#CFCCC9; --mn-border-3:#B7B4B0; --mn-grid:#E5E3DF;
  /* 文字阶 */
  --mn-ink:#242424; --mn-ink-2:#57534F; --mn-ink-3:#8A8886; --mn-ink-4:#AEABA8;
  /* 语义四态(达标/告警/阻断 + 陈旧另配) */
  --mn-ok:#107C10; --mn-ok-bg:#E2F4E0; --mn-ok-bd:#9BD49B;
  --mn-warn:#9A6700; --mn-warn-bg:#FCF3D2; --mn-warn-bd:#E7C766;
  --mn-bad:#C50F1F; --mn-bad-bg:#FCE6E8; --mn-bad-bd:#EBA9AF;
  /* 材质 */
  --mn-shadow-node:0 1px 2px rgba(0,0,0,.10);
  --mn-sans:'Segoe UI Variable','Segoe UI',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;
  --mn-mono:'Cascadia Code','Cascadia Mono',ui-monospace,Consolas,monospace;
}
```
> **暗色主题**:dc.html 内有暗色映射(如 `--shadow-node:0 1px 4px rgba(0,0,0,.55)`),Codex 从 dc.html `:root` 的暗色块抽取补全。**语义色非唯一信息载体**:必配图标/形状。

## 二、实现卡批(按依赖排序;先令牌、再图元、再外壳)

### SKIN-TOKENS(最先,最高杠杆)— 前端
- 把上面令牌写入 `tokens.css`(与现有 `--mnext-*` 对齐/合并,不破坏)。全站 surface/ink/accent/语义/字体改引用这套变量。
- 红黄绿映射到现有规则灯(BLOCK=bad / WARN=warn / OK=ok)。亮/暗双主题。
- 验收:全站观感统一为 Fluent 浅色;暗色可切;规则灯三色一致;无回归。

### SKIN-NODE(核心)— 前端,改 `object-node.tsx`(承 SKIN-v2)
- 按 `图元风格概念.dc.html` 出节点:**类型色条/图标 + 等宽代号(BAT)+ 名称**;1–2 存储字段 + **fx 派生芯片(浅底·后端实时)**;**规则灯(红/橙/绿 图标+色双编码)**;**provenance 护照**(来源·新鲜度·下游数);四周**端口锚点**。
- **全状态**:默认/悬停/选中/**recomputing(fx 转圈)**/**blocked(红边红角)**/**stale(琥珀)**/否决(灰+删除线)/只读 vs 可编辑。
- 四类型外观各一:`分系统 / 组件 / 接口 / 需求`。
- 验收:对照 dc.html,各类型各状态一致;不改数据逻辑。

### SKIN-EDGE — 前端,React Flow 自定义边
- 类型(实/虚/粗细/箭头)区分关系;方向;状态(active / unlinked 灰虚 / 选中 / 命中规则 红);正交+曲线两种走线;连线标签。

### SKIN-WIDGETS — 前端,可复用小组件
- `fx 派生芯片` / `规则灯(三态)` / `provenance 护照` / `陈旧标`,供属性/校验/表格/节点复用(对齐 inspector 现有派生/规则展示)。

### SHELL-FLUENT — 前端,改 `home/*` + 工作台 chrome
- 按 `首页.dc.html`:**登录**(M-Next + DATA HUB;账号密码 + SSO 入口标"待接入";default/loading/error 态)、**项目列表**(项目卡:名称·所属插件·更新时间·我的角色·告警计数 + 搜索/按插件筛 + 新建主按钮 + 空态)、**新建向导三步**(命名→选插件(卡片+搜索,接 `/views/templates`)→基础配置→进工作台)、**插件库**(已装列表 启停/查看)。
- 工作台外壳(顶栏菜单 文件/编辑/视图/模型/校验 + 工具条 选择/连线/自动布局 + 视图入口 图/表/文本/分屏 + 重新校验 + 亮暗切换)按 `工作台.dc.html` 贴 Fluent 皮。**壳/停靠用 dockview,不重写。**

## 三、与现状/红线
- 纯前端换肤 + 组件实现;**零后端/契约**;复用现有 view/command 客户端,不改数据逻辑。
- 复用已建:`object-node.tsx`(SKIN-v2)、F4 维度、F5 面板、inspector、home。
- 每卡:从 main 起、提交不合并、`pnpm verify` 全绿、只 add 本卡文件、对现有行为零回归。

## 四、建议次序
SKIN-TOKENS → SKIN-NODE → SKIN-WIDGETS → SKIN-EDGE → SHELL-FLUENT。**TOKENS 先合**(让后面所有卡都在统一令牌上做)。
