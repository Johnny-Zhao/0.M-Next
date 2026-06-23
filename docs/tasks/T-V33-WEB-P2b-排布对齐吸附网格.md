# T-V33-WEB-P2b — 前端 P2b:排布(对齐 / 分布 / 吸附 / 网格 / 参考线)

蓝本:`功能全集清单-制图工作台.md` A 区 + 排期 P2b。**packages/web 域,纯前端**。前置:P1(React Flow 就绪)。**与 P2a/P2c/P2d 文件基本不相交,可并行。**

定位:让图"摆得整齐"——对齐、等距分布、吸附网格、参考线。**纯视图几何操作**(节点位置在 P1 里是布局产生的视图态、未入库),本卡不产生命令、零后端依赖,风险最低。

## 范围
- **对齐 / 分布**:多选后 左/右/顶/底/水平居中/垂直居中 对齐;水平/垂直等距分布。作用于 React Flow 节点坐标(视图态)。入口**选中后浮起的小工具条**(渐进式展开,不常驻)。
- **吸附 / 网格**:`<Background variant="dots|lines">` 网格;`snapToGrid` + `snapGrid` 吸附;可开关。
- **智能参考线**:拖动时与邻近节点的边/中心对齐出现参考线(自绘 overlay)。
- 这些**不改模型、不发命令**;若将来要"持久化布局"(位置入库)→ 另卡 + 需 view-API/命令(本卡明确不做)。

## 封闭文件清单
**修改**:`packages/web/src/workbench/diagram-panel.tsx`(挂 Background/snap、对齐工具条)、`styles.css`
**新增**:`packages/web/src/workbench/align.ts`(对齐/分布纯函数)、`guides.tsx`(参考线 overlay)、`align.test.ts`
**零碰**:`packages/views/**` 源、后端、契约、迁移。

## 红线 / 门禁
- **纯视图**:只改 React Flow 节点坐标(内存),**不发命令、不入库、不碰后端**;不持久化位置(留跟进)。
- 不新增依赖;不碰 views 源/契约/迁移。
- `corepack pnpm verify` 全绿;`align.ts` 对齐/分布算法有单测(给定坐标→期望坐标)。
- 分支 `feat/T-V33-web-p2b` 提交不合并;`git merge main` 拉平;完成发 diff --stat + web 测试汇总。

## 验收
1. verify 全绿;`align.ts` 单测覆盖六种对齐 + 两向分布(纯函数断言坐标);吸附/网格可开关渲染;参考线在拖动时出现。
2. 全程不产生命令/网络写;无后端/契约/迁移 diff;views 源零改;无新依赖。

## 跟进(本卡不做)
布局持久化(节点位置入库,需 view-API + 命令)、自动布局算法(P5b dagre/elkjs)。
