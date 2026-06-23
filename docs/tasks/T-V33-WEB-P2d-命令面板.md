# T-V33-WEB-P2d — 前端 P2d:命令面板 ⌘K(到达一切 + 定位)

蓝本:定稿 §3bis(⌘K 为到达一切功能的通用入口)+ 排期 P2d。**packages/web 域,纯前端**。前置:P1。**与 P2a/P2b/P2c 不相交,可并行。**

定位:一个 `⌘K` 命令面板,作为"渐进式展开"的总入口——搜对象定位、运行命令、切视图/开面板,免去常驻平铺。**所有写命令仍经 `CommandClient`**;面板只是触发器。

## 范围
- **唤起**:`⌘K` / `Ctrl+K` 打开浮层;输入即过滤;↑↓ 选择,Enter 执行,Esc 关闭。
- **命令注册表**:可扩展的 `commands` 列表(id/标题/分组/动作/可用条件),供后续功能往里注册(不写死)。初始项:
  - **定位(go-to)**:搜对象(名/代号)→ 选中并在画布聚焦(复用 `ViewClient` 读 + `SelectionCoordinator`)。
  - **写命令**:新建对象、改字段…(经 `CommandClient`)。
  - **视图/面板**:切镜头、打开/停靠面板(调 dockview API)。
- **空态/分组**:无匹配显示"无匹配命令";按分组(定位/编辑/视图/分析…)展示。
- 入口落位与样式交给后续 Design 换肤;本卡先朴素可用。

## 封闭文件清单
**修改**:`packages/web/src/workbench/workbench.tsx`(挂全局 ⌘K + 命令注册入口)
**新增**:`packages/web/src/workbench/command-palette.tsx`、`commands.ts`(注册表 + 内置命令)、`command-palette.test.tsx`
**零碰**:`packages/views/**` 源、后端、契约、迁移。

## 红线 / 门禁
- 写命令**经 `CommandClient`**;读/定位经 `ViewClient`;面板自身不发明写路径。
- 命令注册表**可扩展**(后续卡往里加,不改面板核心);不新增依赖。
- 不碰 views 源/契约/迁移;`corepack pnpm verify` 全绿。
- 分支 `feat/T-V33-web-p2d` 提交不合并;`git merge main` 拉平;完成发 diff --stat + web 测试汇总。

## 验收
1. verify 全绿;测试:⌘K 唤起、输入过滤、Enter 执行(定位命令→选中聚焦;写命令→`CommandClient` 调用 mock 断言)、无匹配空态、分组渲染。
2. 命令注册表可由外部追加(测试断言新增一条命令后出现在面板)。
3. 无后端/契约/迁移 diff;views 源零改;无新依赖。

## 跟进(本卡不做)
更多命令随各功能卡注册(分析/导出/比选…);最近命令/快捷键提示;模糊搜索排序优化。
