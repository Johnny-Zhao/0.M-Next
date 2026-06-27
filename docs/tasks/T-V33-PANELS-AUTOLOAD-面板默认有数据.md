# T-V33-PANELS-AUTOLOAD — 面板一进来就有数据(消"白栏目、点了才出")

蓝本:`docs/design/M-Next 工作台.dc.html`。
**packages/web 域,纯前端,零后端/契约。** 前置:main。
定位:进工作台时,模型树空白、校验面板要手动"运行"、标签页未点纯白——demo 观感差。本卡让常驻面板**默认就加载并显示数据**,标签页给占位/预热。

## 现状(已核实)
- `workbench.tsx`:diagram 为活动面板,floorplan/table/matrix/document 以 `inactive:true` 叠为标签页(dockview 懒加载→未点纯白);tree(左)/inspector(右)/validate(下)为常驻分屏。
- **模型树** `tree-view`:默认 rootId 为空 → 空白(且 adjacent 非 hierarchical)。
- **校验** `validate-panel`:显示"尚未运行校验,点击运行校验"。
- **属性** inspector:未选对象显示"请选择对象"(此为合理,保留)。

## 范围(纯前端)
- **A. 模型树默认有根**:进入即以**层级关系**(室内 `contains`)+ 户型(floorplan)为根加载树;
  - 取根策略:优先当前 workspace 里 floorplan 类型的首个对象;其关系类型用该领域的 hierarchical 关系(contains);若无层级关系/无 floorplan,则**回退**为"按对象类型平铺列出"(如列出 room),不再空白。
  - 不改 tree 后端查询语义;只在前端补"自动选根 + 回退列表"。
- **B. 校验面板默认出态**:进入即拉取当前对象集的规则灯(复用 `/views/rule-status` 或对象视图里的 ruleStatus),显示**红/黄/绿计数 + 命中列表**(如"暗次卧 采光 阻断");"重新校验"按钮保留触发真实 RunRuleCheck。空态文案友好。
- **C. 标签页不纯白**:table/matrix/document 等懒加载面板,未就绪时显示**骨架/占位**(列头/网格骨架 + "加载中"),或激活即触发拉取;不再是纯白。
- **D. 空/加载态统一**:各面板空态给简短提示文案(对齐"模型优先、安静"基调),加载给骨架。

## 封闭文件清单
**修改**:`packages/web/src/workbench/{tree-panel,validate-panel,table-panel,matrix-panel,document-panel}.tsx`、`packages/views/src/tree/tree-view.tsx`(回退列表,仅前端)、`packages/web/src/workbench/workbench.tsx`(按需:为树提供默认根/层级关系)、`styles.css`、相关 test。
**零碰**:后端、契约、迁移、视图请求语义、命令。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改视图查询/分页语义,只补"默认根/自动拉取/回退/骨架"。
- 默认根的选取要安全:无 floorplan/无层级关系时回退、不报错、不 500。
- 不新增依赖;`corepack pnpm verify` 全绿;对现有视图零回归。
- 分支 `feat/T-V33-panels-autoload` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 进"技术方案A"工作台:**模型树自动列出户型/房间**(以户型为根的层级);**校验面板默认显示红黄绿汇总**(暗次卧阻断可见),无需手动点。
2. 切到表格/矩阵/文档 tab:有骨架/即时数据,不再纯白。
3. 无 floorplan 的工作空间:树回退平铺列表,不报错;`错误 0`。
4. verify 全绿;无后端/契约 diff。
