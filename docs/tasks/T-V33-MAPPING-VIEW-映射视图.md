# T-V33-MAPPING-VIEW — 映射视图(阶段二·2c)

蓝本:阶段二 2c。**packages/web + packages/views 域,纯前端,零后端/契约**(读 2b 已暴露的对应/覆盖端点)。
**前置:MAPPING-PROFILE 已合入**(跨域对应关系 + 读端点已在)。

## 目标
新增**映射 perspective 视图**:双栏展示源/目标 profile 的 stereotype 对应(元模型骨架),下钻到实例级覆盖(已映射/未映射/已过期)。让"一套模型多重表达"长出跨域追溯这一档。

## 范围(纯前端)
- **A. 双栏对应骨架**:左源 profile stereotype、右目标 profile stereotype,中间连线标出 correspondence 对应(读 2b 端点)。骨架小而稳,预加载。
- **B. 实例覆盖下钻**:点某条对应 → 该对应下实例级列表:源实例 → 目标实例,标记**已映射 / 未映射 / 已过期**(过期 = 源版本 > 映射锚定版本);懒加载分页。
- **C. 交互**:点对应/实例走 SelectionCoordinator 联动高亮;空态/加载骨架;方向指示(源→目标)。
- **D. 样式**:`--mn-*` 令牌、Fluent、亮暗双主题;大映射限定 page size。
- **E. 不改**:对应/覆盖端点语义、其它视图、转换执行(只读结果,不触发)。

## 封闭文件清单
**修改/新增**:`packages/views/src/mapping/`(映射视图组件)、`packages/web/src/workbench/` 接入 perspective + shell 入口、styles.css、相关 test;只读复用 view-client 的对应/覆盖查询、SelectionCoordinator(不改语义)。
**零碰**:后端、契约、命令、其它面板内部逻辑。

## 红线 / 门禁
- 纯前端;**零后端/契约/迁移/依赖**;映射视图**只读**预算好的覆盖/过期,不实时 JOIN、不触发转换。
- 现有视图/功能零回归;`corepack pnpm verify` 全绿;亮暗双主题。
- 分支 `feat/T-V33-mapping-view` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 打开装了映射 profile 的工作空间,映射视图双栏显示 stereotype 对应连线。
2. 点对应下钻实例覆盖,正确显示已映射/未映射/已过期;点选联动高亮。
3. 空态/加载/亮暗友好;切到映射视图与切其它视图同样顺(无可感卡顿);verify 全绿;无后端/契约 diff。

## 跟进(本卡不做)
覆盖率统计/缺口高亮汇总;映射导出;实时协同仿真动画(走动态/动画轨)。
