# 当前状态（每张卡合并后更新本文）

更新：2026-07-02

## 执行队列进度

| 卡 | 内容 | 状态 |
|---|---|---|
| 卡0 | 仓库收口、v0.1 基线（main、verify 绿、worktree 清理） | ✅ 完成 |
| T-V01-1 | TECHDOC_DEMO 入口 + techdoc 默认布局 preset | ✅ 已合并 |
| T-V01-2 | seed 加厚：功耗参数链 + 超预算 BLOCK + 3 比选方案 | ✅ 已合并 |
| T-V01-3 | 保存即自动校核（前端） | 🔄 进行中 |
| T-V01-4a | 导出契约：文档树范围(rootId)+章节映射（**人审契约**） | 待发 |
| T-V01-4b | DocxRenderAdapter 章节化渲染（标题层级/参数表/校核结论表） | 待发 |
| T-V01-4c | 前端导出入口带文档树 rootId | 待发 |
| T-V01-6 | **最小创作能力**：新建方案项目 + 文档树加章节/模块 + 填参数 + 导出自有 Word（导出合龙后最高优先） | 待定义（4a 人审期间出规格） |
| 杂项收口卡 | 状态提示/文案/跨类型校核可见（已降级为尾巴，其中"跨类型校核可见"优先级最高） | 降级待发 |
| 卡V | 30 分钟启动验收脚本 docs/验收-v0.1-golden-path.md | 待发 |

## 已消灭的 P0

- P0-1 入口断链（卡1）
- P0-3 示例无参数/比选/红灯（卡2）
- P0-4 基线混乱（卡0：main=基线，branch-per-card）

## 已知遗留（不阻断，进杂项卡或 backlog）

1. 项目卡片"所属插件"直接显示 templateCode 内部码
2. TreePanel 默认根类型/关系硬编码 floorplan/contains
3. DevSeedRunner 对已有库跳过重种——seed 变更后验收必须重置数据卷
4. 拷贝仓库时 .git/packed-refs 疑似受损——若 git fsck 报错需处理

## 环境事实

后端 Java 21 + Spring Boot 3（本机 Temurin 21）；前端 Node 22+/pnpm 10.12.1（corepack）；主存储仅 PG 强依赖。
