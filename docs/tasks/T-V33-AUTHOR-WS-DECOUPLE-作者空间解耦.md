# T-V33-AUTHOR-WS-DECOUPLE — 作者空间与 Demo 解耦(阶段三)

> ⚠️ 改 ProfileLoader/DevSeedRunner 装载语义(作者空间归属)+ 工作空间列表过滤,人工发起。蓝本:阶段三。
> **前置:PROFILE-SCOPED-TYPES 已合入。** 建议在 META-DB-CONSTRAINTS 前后均可(与之独立)。

## 目标
消除历史混用:`AUTHOR_WORKSPACE` 当前与室内 demo 工作空间共用 `11111111`。改为作者空间用**独立隐藏 UUID**(不进 `/views/workspaces`),室内 demo 改为正常实例化的独立工作空间。对齐 MOF 严格分层。

## 现状(已核实)
- `ProfileLoader.AUTHOR_WORKSPACE = 11111111-1111-4111-8111-111111111111`,所有模板元模型装于此。
- `DevSeedRunner`:室内 install 于 `11111111` 并直接在 `11111111` 种 demo 对象(作者空间=demo 空间);技术方案 demo 在 `22222222`、MBSE(待点亮)在 `33333333`。
- `/views/workspaces`(PROJECT-LIST-REAL)列出真实工作空间。

## 范围
- **A. 独立作者空间**:`ProfileLoader` 作者空间改为独立保留 UUID(如 `a0000000-…`,所有 profile 元模型仍 co-located 于此,便于跨域映射)。所有 define/publish 命令用新作者空间。
- **B. 室内 demo 独立化**:`DevSeedRunner` 室内改为像技术方案/MBSE 一样**实例化**到独立 demo 工作空间(如 `11111111` 继续作室内 demo,但其元模型来自作者空间的实例化,而非"就地 author+seed");幂等。
- **C. 工作空间列表过滤**:`/views/workspaces` **隐藏作者空间**(按保留 UUID 或标记过滤)。
- **D. 不改**:类型身份语义、读模型投影、写入命令语义、各领域 manifest。

## 封闭文件清单
**修改**:`packages/server/.../plugin/ProfileLoader.java`(AUTHOR_WORKSPACE)、`DevSeedRunner.java`(室内改实例化、幂等)、工作空间列表查询/控制器(过滤作者空间)、相关 E2E。
**零碰**:Flyway 迁移(本卡尽量零迁移;若需标记列再评估)、类型身份逻辑、读模型投影、前端、manifest。

## 红线 / 门禁
- dev 重置后:三领域 demo 照常、作者空间不出现在项目列表;幂等重启不重复种。
- **不改类型身份/写入语义**;仅迁作者空间归属 + 室内 demo 装配方式 + 列表过滤。
- 尽量**零迁移**(若必须加"系统/隐藏"标记列,单独评估并在卡内回报)。
- `corepack pnpm verify` 全绿(含后端 E2E)。
- 分支 `feat/T-V33-author-ws-decouple` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main` + 测试汇总。命中红线停下回报,不夹带。

## 验收
1. dev 重置+重起:`/views/workspaces` 列出室内/技术方案/MBSE 三 demo,**不含**作者空间。
2. 三领域元模型仍 co-located 于独立作者空间(跨域映射前提保留);各 demo 视图/派生/规则零回归。
3. 幂等重启正常;verify 全绿。

## 跟进(本卡不做)
namespace `::` 全限定名;能力市场/跨域引用稳定标识。
