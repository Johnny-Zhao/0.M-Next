# 当前状态

更新：2026-07-03（导出闭环合龙日）。工作流 v3：代码默认 Codex 实现；前端轻简报+业主审；后端/契约 Fable 审；前端合并门槛 `verify:web`。

## 里程碑

**核心闭环已通**：打开技术方案 Demo → 改参数 → 派生重算+自动校核 → 导出章节化 Word（树序正确、参数表、校核结论表）。首份模型驱动 Word 已于 2026-07-03 导出成功。

## 待办与进度

| 事项 | 谁 | 状态 |
| --- | --- | --- |
| 仓库收口、v0.1 基线 | 人 | ✅ |
| TECHDOC_DEMO 入口 + 默认布局 | Codex | ✅ 已合并 |
| seed 加厚（参数链/红灯/比选） | Codex | ✅ 已合并 |
| 保存即自动校核 | Codex | ✅（合并状态待业主确认） |
| 4a 导出契约（treeScope/sectionMapping） | Codex | ✅ 已合并 |
| 4b docx 章节化渲染 | Codex | ✅ 已合并 |
| 4c 前端导出走文档树 | Codex | ✅ 验收通过，合并中 |
| 4d 导出观感修缮（标题样式注入/fieldLabels 契约小增补人审/默认段落/状态中文化） | Codex | 🔄 已发 |
| 概览条（总功耗/预算/超预算徽章，refreshVersion 联动） | Codex（并行） | 🔄 已发 |
| 最小创作能力（新建方案+文档树加章节模块+填参数+导出自有 Word） | Codex（业主定交互） | 🔄 无阻断切片已做（feat/T-V01-6-authoring-minimal）：向导「技术方案」路径建 proposal 根+templateCode 直入工作台、文档树节点归档流；「加模块」（CreateRelation）与 Inspector 新建后聚焦阻断于 6a，待 relation-types 端点合并后补 |
| 跨类型校核可见 | — | 概览条落地后重评，可能降级 |
| 30 分钟启动脚本 | Fable | 待做 |
| 演示打磨杂项 | — | 降级 v0.1 后 |

## 新发现（2026-07-03，T-V01-6 探明阶段）

- **历史断点**：前端创建关系从未真正可用——CommandController 严格要求 relationTypeId 为 UUID，前端只持有 code，且无 relation-types 读端点（室内画布连线同样受影响，室内已冻结不修）。→ T-V01-6a 补只读 relation-types 端点。
- **2026-07-03 审查发现**：Codex 对 T-V01-6 只交付了向导段（part1，质量合格可收），跳过了被阻断的"加模块/归档"且未做 6a。处置：part1 单独合并；6a 重发（只做端点）；之后发 6-part2（加模块+归档）。教训入规：**收货先跑验收一句话**。
- CreateObject 响应不直接携带新对象 id，前端按既有模式（事件+唯一字段查询）兜底。
- **无阻断切片已落**（feat/T-V01-6-authoring-minimal，verify:web 全绿）：CommandClient 新增 createObject/archive（走已注册 /commands）；向导「技术方案」= 名称+功耗预算 → instantiateWorkspace → CreateObject(proposal: title/version=v1/author/power_budget_w) → onOpenWorkspace 携带 templateCode 直入工作台；文档树节点「归档」确认流 → Archive → 刷新（onArchived 联动概览条 refreshVersion）。**留待 6a**：文档树「加模块」（需 relationTypeId UUID）与 Inspector 新建后聚焦（其唯一触发＝加模块）。

## 已知问题（4d 修复中）

1. 导出的 docx 标题无样式定义 → Word 导航窗格为空（POI 空白文档坑，已确认）
2. 参数表标签为字段码（power_w）
3. 无 sectionMapping 时描述类字段不出段落，文档偏骨架
4. 校核结论表状态为英文码（BLOCK/WARN/UNKNOWN）

## 环境与门禁事实

Java 21（Temurin）/ Node 22+ / pnpm 10.12.1；前端合并门槛 `corepack pnpm verify:web`（约 1~2 分钟，不跑 Java）；全量 `verify` 用于后端/契约与发布前（先 `dev:down`，jar 锁）；seed/manifest 变更后验收需重置 postgres 数据卷。
