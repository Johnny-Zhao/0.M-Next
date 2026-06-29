# T-V34-INSTANCE-REUSE-T1 — 实例级组件复用后端(最小可用)

> 蓝本:`docs/设计-实例级组件复用.md` 第 3/4/7 节(T1)。
> **packages/server(+ kernel 命令)域,后端;含一处迁移(锁 V28)。** 前置:main(阶段一 profile 隔离、命令入口、血缘已在)。
> 范围只做**可复用片段定义 + by-copy 放置命令 + 目录只读端点**;前端拖放/目录 UI 留 **T1-fe 跟进卡**。

## 目标
补复用阶梯最缺的"实例层":定义一个**可复用装配(definition)**,可在工作空间里**放置(usage)**为真实对象/关系子图,放置走命令入口、记出处。T1 仅 **by-copy**(克隆),by-ref/版本钉住留 T2。

## 现状(已核实)
- 写入全经命令入口(`commands.createObject/createRelation`;meta 命令;2a 的 ApplyProfile 是"经既有命令并入"的范例)。
- `InstantiateWorkspace` 只能整模板实例化;无"放置可复用子图"机制。
- 阶段一已按 (profile, code) 隔离类型身份(装配内类型不撞的前提);血缘/出处机制在。

## 范围(T1,后端,by-copy)
- **A. 迁移(锁 `V28`)** `reusable_assembly`(definition):
  `assembly_id UUID PK, name VARCHAR(256) NOT NULL, template_version_id UUID NOT NULL(所属 profile), version BIGINT NOT NULL DEFAULT 1, params JSONB NOT NULL DEFAULT '{}', content JSONB NOT NULL(子图蓝图:对象类型+字段+关系模板), created_by/at`;唯一 `(template_version_id, name)`。纯新增表。
- **B. 定义命令** `DefineReusableAssembly`(经 meta/命令入口):落 `reusable_assembly`;幂等;字段/关系类型须属该 profile(校验)。
- **C. 放置命令** `PlaceAssembly(workspaceId, assemblyId, version, 放置参数)`:**by-copy** 把蓝图实例化为真实对象/关系——**经既有 `createObject`/`createRelation` 命令路径**逐个落地;每个生成对象记**出处**(`assembly_id + version` 来源,放进既有 source/血缘机制,不新造一套);幂等(同一放置键不重复)。
- **D. 目录只读端点** `GET /workspaces/{ws}/views/reusable-assemblies?profile`(列该 profile/工作空间可用 definition:name/version/对象类型概览),沿用只读视图风格。
- **E. 不改**:createObject/createRelation 写入语义(只是被 PlaceAssembly 调用)、读模型投影、InstantiateWorkspace、其它领域。

## 封闭文件清单
**修改/新增**:`packages/server/.../db/migration/V28__reusable_assembly.sql`、DefineReusableAssembly / PlaceAssembly 命令 + handler(server/kernel 相应层,**经既有命令入口**)、出处落地(复用既有 source 机制)、`ReusableAssemblyRepository` + 目录端点(`ViewQueryController` 只读)、view-client 类型(只读,按需)、相关 E2E。
**零碰**:createObject/createRelation 既有语义、读模型投影、InstantiateWorkspace、迁移以外的写入路径、前端拖放/UI(那是 T1-fe)、其它领域。

## 红线 / 门禁
- **放置(usage)全经既有 createObject/createRelation 命令入口落地;不绕过命令、不直写 rm_*。**
- by-copy 克隆;出处可追溯(用既有 source/血缘,不新造)。
- 迁移**仅新增表(锁 V28)**、既有数据零破坏。
- definition 遵循 **extends 只增不改**思想;幂等(重复放置/定义不重复、不报错)。
- 现有功能零回归;Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`)。
- 分支 `feat/T-V34-instance-reuse-t1` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡相关文件;发 `git diff --stat main`(含 V28)+ 测试汇总。命中红线(绕过命令入口/动读模型/改 createObject 语义)停下回报,不夹带。

## 验收
1. 可 DefineReusableAssembly 定义一个子图蓝图(某 profile 下);幂等。
2. PlaceAssembly 把它 by-copy 放置进工作空间,生成真实对象/关系(经命令入口),每个带 assembly 出处;重复放置幂等。
3. `GET /views/reusable-assemblies` 列出可用 definition;只读、无 createObject/读模型 diff;现有功能零回归;verify 全绿 Skipped:0。

## 跟进(本卡不做)
- **T1-fe**:目录浏览 + 拖放放置 UI + usage 来源标识。
- T2:by-ref(引用)+ 版本钉住/跟随升级 + detach。
- T3:实例级目录接入能力市场、跨组织共享、参数化高级(条件/循环子图)。
