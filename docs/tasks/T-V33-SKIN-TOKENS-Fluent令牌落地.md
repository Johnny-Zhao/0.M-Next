# T-V33-SKIN-TOKENS — Fluent 设计令牌落地(纯前端换肤,零后端)

蓝本:`docs/设计落地-Fluent界面与令牌.md`(来自 Claude Design 导出的 Fluent 浅色设计)。**packages/web 域,纯前端、零后端/契约。** 前置:main。
定位:把设计稿的整套 Fluent 令牌(配色/字体/材质/语义四态)写进 `tokens.css`,让全站观感统一为设计稿样子。这是后续所有换肤卡的地基,先做、先合。

## 现状(先验证)
- `packages/web/src/tokens.css` 已存在(SKIN-v2 建,含 `--mnext-brand #5b5fc7` 等)。本卡**对齐/扩充**为设计稿全套令牌,**不破坏现有引用**。
- 规则灯现用语义色;本卡把 BLOCK/WARN/OK 映射到新语义令牌。

## 范围
- **A. 写入令牌(浅色默认 + 暗色映射)**到 `tokens.css`(命名沿用或别名到现有 `--mnext-*`,避免破坏现有组件):
```css
:root{
  --mn-accent:#5B5FC7; --mn-accent-d:#4549A0; --mn-accent-bg:#EEEEFB; --mn-accent-bd:#C4C6EE; --mn-accent-ring:rgba(91,95,199,.28);
  --mn-bg:#EEEDEB; --mn-bg-1:#F3F2F0; --mn-surface:#FFFFFF; --mn-surface-2:#F4F3F1; --mn-surface-3:#ECEAE7; --mn-panel:#FAF9F8;
  --mn-border:#E6E3E1; --mn-border-2:#CFCCC9; --mn-border-3:#B7B4B0; --mn-grid:#E5E3DF;
  --mn-ink:#242424; --mn-ink-2:#57534F; --mn-ink-3:#8A8886; --mn-ink-4:#AEABA8;
  --mn-ok:#107C10; --mn-ok-bg:#E2F4E0; --mn-ok-bd:#9BD49B;
  --mn-warn:#9A6700; --mn-warn-bg:#FCF3D2; --mn-warn-bd:#E7C766;
  --mn-bad:#C50F1F; --mn-bad-bg:#FCE6E8; --mn-bad-bd:#EBA9AF;
  --mn-shadow-node:0 1px 2px rgba(0,0,0,.10);
  --mn-sans:'Segoe UI Variable','Segoe UI',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;
  --mn-mono:'Cascadia Code','Cascadia Mono',ui-monospace,Consolas,monospace;
}
```
  暗色主题(`[data-theme="dark"]` 或现有暗色机制):从 `docs/design/工作台.dc.html` 的 `:root` 暗色块抽取对应值(如 `--mn-shadow-node:0 1px 4px rgba(0,0,0,.55)`);**取不到就保守取深色等价值,不臆造**。
- **B. 全站引用**:body/面板/卡片/边框/文字/字体改用上述令牌;规则灯 BLOCK→`--mn-bad*`、WARN→`--mn-warn*`、OK→`--mn-ok*`;正文用 `--mn-sans`、代号/单位/fx 用 `--mn-mono`。
- **C. 语义非唯一**:规则灯保留图标/形状,不只靠颜色。

## 封闭文件清单
**修改**:`packages/web/src/tokens.css`、`packages/web/src/styles.css`(把硬编码色改引用令牌)、(按需)`object-node.tsx`/`inspector` 里规则灯取色处改引用语义令牌。
**零碰**:后端、契约、迁移、`packages/views` 数据逻辑、布局结构(本卡只换色/字/材质,不动布局)。

## 红线 / 门禁
- 纯前端换肤;**零后端/契约**;**不改布局结构与数据逻辑**(只配色/字体/材质/语义色)。
- 对现有功能零回归(切换、画布、面板照常);亮/暗双主题可用。
- 不新增依赖;`corepack pnpm verify` 全绿。
- 分支 `feat/T-V33-skin-tokens` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + web 测试汇总。

## 验收
1. 起前端,全站观感为 Fluent 浅色(白/暖灰表面、`#5B5FC7` 强调、Segoe/Cascadia 字体)。
2. 规则灯红/黄/绿与设计稿一致,带图标。
3. 暗色可切;无功能回归;无后端/契约 diff。

## 跟进(本卡不做)
SKIN-NODE(图元节点全状态)、SKIN-WIDGETS、SKIN-EDGE、SHELL-FLUENT(外壳屏)。
