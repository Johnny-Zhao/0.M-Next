# T-V33-SKIN-NODE — 户型节点图元美化(纯前端,按 图元风格概念.dc.html)

蓝本:`docs/design/图元风格概念.dc.html` + `docs/设计落地-Fluent界面与令牌.md` 的 SKIN-NODE 段。
**packages/web 域,纯前端,零后端/契约。** 前置:main(已含 DERIVED-VIEW:派生值已进视图)。
定位:把现在被截断、挤成一行的节点,做成原型那样规整的卡片——**面积/窗地比各一枚 fx 芯片、规则灯、字段、provenance、端口、各状态**。承接 `object-node.tsx`(已具骨架),只换皮+理数据,不动数据来源。

## 现状(已核实)
- `object-node.tsx` 已有结构:类型色条/图标、代号、名称、`RuleLamp`(OK/WARN/BLOCK 图标+色)、字段 `dl`、**单个 `fxText` 字符串**、`provenance-passport`、`PortHandles`、`visualState`(default/recomputing/blocked/stale/vetoed)。
- 痛点:`fxText` 是**一行字符串**(`diagram-panel.tsx` 拼的),被卡片宽度截断("窗地比=" 后数字看不见),面积也挤没;provenance 仍 `TODO`;卡片偏窄。
- 派生值已在视图返回(DERIVED-VIEW),`diagram-panel.tsx` 能拿到 room 的 `area_fx`/`window_floor_ratio_fx`。

## 范围(纯前端)
- **A. 多枚 fx 芯片(核心)**:`object-node.tsx` 的 `fxText:string` 改为 `derivedChips: {label:string; value:string; unit?:string}[]`;`diagram-panel.tsx` `objectNodeData` 把派生值组装成数组(如 `面积 23.5 ㎡`、`窗地比 0.078`),逐枚渲染为**浅底 fx 芯片(标注"后端实时·只读")**,不再截断。无派生时不显芯片(不再显 TODO 占位)。
- **B. 卡片尺寸/版式**:按 dc.html 调宽度/内边距/行距,芯片可换行不溢出;字段区显示**关键存储字段**(长/宽/朝向/窗面积),而非 name/usage 重复。代号用等宽字体(`--mn-mono`)。
- **C. 规则灯**:对齐 dc.html——色+图标双编码(BLOCK 红、WARN 橙、OK 绿),保持 `data-rule` 可访问性。
- **D. provenance 护照**:用**真实**信息——来源(source,如"人工绘制")+ 新鲜度(updatedAt 相对时间)。下游数等暂无视图支持的就**不显**,不杜撰、不再写 TODO 文案。
- **E. 状态视觉**:default/悬停/选中/recomputing(fx 转圈)/blocked(红边红角)/stale(琥珀)/vetoed(灰+删除线)/只读 按 dc.html 出 CSS;room 类型给一个合适图标(`objectTypeVariant` 对 room 的映射可补一个室内向图标,或复用现有,不强求)。
- **F. 维度叠加**:切"光/热/风"时房间按该维度着色(`dimensionTone`)逻辑已在,确认不回归即可。

## 封闭文件清单
**修改**:`packages/web/src/workbench/object-node.tsx`、`packages/web/src/workbench/diagram-panel.tsx`(仅节点数据组装:派生数组、字段挑选、provenance 文案;**不改请求/查询**)、`packages/web/src/styles.css`(节点相关样式)、按需 `ports.tsx`、相关 `.test.tsx`。
**零碰**:后端、契约、迁移、`packages/views` 数据逻辑、视图请求语义、其它面板。

## 红线 / 门禁
- 纯前端换皮 + 数据组装;**零后端/契约**;不改任何请求 URL/查询语义/数据来源。
- 只用**真实**数据渲染(派生值、source、updatedAt);无数据的字段省略,**不杜撰、不留 TODO 文案**。
- 规则灯保持色+图标双编码(语义非唯一靠颜色)。
- 不新增依赖;`corepack pnpm verify` 全绿;对画布/选择/维度切换零回归。
- 分支 `feat/T-V33-skin-node` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 进工作台,户型卡片每个房间显示**面积、窗地比两枚 fx 芯片**(真值、带单位、不截断),字段区列长/宽/朝向/窗面积。
2. 规则灯红/橙/绿带图标;暗次卧 BLOCK 红边角;provenance 显真实来源+新鲜度。
3. 选中/悬停/只读等状态视觉清晰;维度切换(光/热/风)房间重新着色不回归。
4. `错误 0`;verify 全绿;无后端/契约 diff。

## 跟进(本卡不做)
"改宽→面积/规则灯实时重算"编辑闭环(字段编辑入口 + 经命令写入 + 投影重算 + 视图刷新);SKIN-EDGE(连线样式)、SKIN-WIDGETS。
