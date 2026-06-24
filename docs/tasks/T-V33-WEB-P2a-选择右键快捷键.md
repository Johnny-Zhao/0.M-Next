# T-V33-WEB-P2a — 前端 P2a:选择 / 右键菜单 / 快捷键 / 删除·再制·复制粘贴

蓝本:`功能全集清单-制图工作台.md` A 区 + `前端排期-制图工作台第二批.md` P2a。**packages/web 域,纯前端**。前置:P1(`feat/T-V33-web-p1` 已在 main,React Flow + dockview 就绪)。

定位:给图编辑器补上"选得动、右键有菜单、键盘能操作、能删能再制能复制粘贴"这批最基础的编辑手感。**写一律经 `CommandClient`**;纯视图操作(选择/框选)走 React Flow。

## 范围
- **选择**:多选 + 框选(React Flow `selectionMode` / `selectNodesOnDrag` / Shift 加选)、全选;选中跨面板联动复用现有 `SelectionCoordinator`。
- **右键上下文菜单**:`onNodeContextMenu` / `onEdgeContextMenu` / `onPaneContextMenu` → 自定义菜单组件。菜单项:节点(删除、再制、复制、查看详情)、连线(删除关系)、空白画布(粘贴、新建对象、全选)。菜单**渐进式展开**(定稿 §3bis),不平铺常驻。
- **快捷键**:Delete/Backspace 删除选中、Ctrl/⌘+C 复制、Ctrl/⌘+V 粘贴、Ctrl/⌘+D 再制、Ctrl/⌘+A 全选、Esc 取消选择。
- **删除 / 再制 / 复制粘贴 = 经命令**:删对象 → 删除/归档命令;再制/粘贴 → `CommandClient.createObject`(新 id,带 source);删连线 → 删关系命令。位置等纯视图态不入命令。

## 封闭文件清单
**修改**:`packages/web/src/workbench/diagram-panel.tsx`(接选择/右键/快捷键/命令)
**新增**:`packages/web/src/workbench/context-menu.tsx`、`shortcuts.ts`、`clipboard.ts`(复制粘贴缓冲,内存态)、对应 `*.test.tsx`
**零碰**:`packages/views/**` 源、后端、契约、迁移、其它 package。

## 红线 / 门禁
- 删/建/再制/粘贴 **一律经 `CommandClient`**(AG-110);选择/框选/菜单显隐为纯视图。
- 不新增依赖(用 P1 已有 React Flow);不碰 views 源/后端/契约/迁移。
- `corepack pnpm verify` 全绿(web vitest/lint/type-check);不降覆盖率。
- 分支 `feat/T-V33-web-p2a` 提交不合并;基线落后只 `git merge main` 拉平;完成发 `git diff --stat main` + `pnpm --filter @m-next/web test` 汇总。
- 若删除/粘贴需要后端尚无的命令(如批量删除)→ 停下回报,不夹带。

## 验收
1. verify 全绿;测试覆盖:多选/框选、右键菜单三种上下文渲染、快捷键触发对应动作、删除/再制经 `CommandClient`(mock 断言调用 + 重取)。
2. 删/再制/粘贴/删连线均经命令、UI 重取生效;选择跨面板联动不回归。
3. 无后端/契约/迁移 diff;views 源零改;无新依赖。

## 跟进(本卡不做)
**撤销/重做**——已提交的模型命令撤销 = 反向补偿命令,涉及命令历史设计,单列一张卡(P2a-2);本卡不做。
