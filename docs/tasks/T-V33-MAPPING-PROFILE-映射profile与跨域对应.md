# T-V33-MAPPING-PROFILE — 映射 Profile + 跨域对应关系(阶段二·2b)

> ⚠️ 含**契约扩展 + 可能一处迁移** + 放开 relation 端点跨 tv(限映射场景),人工发起。蓝本:阶段二 2b;能力契约见 `docs/设计-领域定制能力边界.md`。
> **前置:WORKSPACE-PROFILE 已合入**(多 profile 共存);PROFILE-SCOPED-TYPES 已合入。

## 目标
引入**映射 profile**:一种不定义领域 stereotype、而是定义**跨 profile correspondence relation_type**(源 stereotype ∈ profile A,目标 ∈ profile B)的特殊 profile;每条对应关系挂**字段映射 + 基数 + 方向**,复用 `m2m_transformation`。借 QVT-Relations 声明式范式。

## 现状(已核实)
- `relation_type` 有 source_type_id/target_type_id/template_version_id;DefineRelationType 端点解析现限本 tv(同 profile)。
- `m2m_transformation` 已有 `correspondence_relation_code` + `object_mappings`(jsonb)+ `relation_mappings`,且 `TransformationRunner`/`CorrespondenceView` 已实现——正是"元模型层对应 + 字段级映射"的现成底座。

## 范围
- **A. 映射 profile 标识**:profile manifest 增可选 `kind: "mapping"` + 声明 `sourceProfile`/`targetProfile` 依赖(装映射 profile 要求两端领域 profile 已 Apply 到工作空间)。
- **B. 跨 profile correspondence 关系**:**仅对映射 profile 内、打标 `kind=correspondence` 的 relation_type**,放开"源/目标 object_type 必须同 tv"约束——允许源 ∈ A、目标 ∈ B。领域内普通关系仍限同 profile(语义不变)。端点按"工作空间内已应用 profile 的 (tv, code)"解析。
- **C. 字段映射明细**:每条 correspondence 关系挂 `m2m_transformation` 的 object_mappings/relation_mappings——字段对应 + 转换表达式(用 OCL 子集,见 OCL-SUBSET;未上线前沿用现有表达式)、**基数**(1:1/N:1/N:M)、**方向**(源→目标转换;反向供追溯)。
- **D. 契约**:对应关系 + 映射明细的读端点(供 2c 视图);仅新增,不动既有端点语义。迁移仅在确需存储新字段时(优先复用 m2m_transformation 现列)。
- **E. 不改**:领域内 relation 语义、读模型投影语义、转换执行(异步,沿用 TransformationRunner)、其它领域。

## 封闭文件清单
**修改**:profile manifest schema(kind/sourceProfile/targetProfile + 解析)、DefineRelationType 端点校验(映射场景放开同 tv;注:阶段一后端点按 tv 解析,映射 profile 内允许端点跨已应用 profile)、relation_type/correspondence 落库与 m2m_transformation 关联(优先复用其现列)、对应关系读端点 + view-client 类型、相关 E2E/单测;**按需**一处加性迁移——**若需,版本号取全局 max+1(跨三模块目录核)**,按所改表所属模块放置。
**零碰**:领域内普通关系语义、读模型投影语义、同步视图路径、其它领域逻辑。

## 红线 / 门禁
- 放开端点跨 tv **仅限映射 profile 内 correspondence 关系**;领域内关系语义零变化。
- 转换执行**保持异步**,不进同步视图路径。
- 迁移(若有)仅新增、既有数据零破坏、可回滚。
- `corepack pnpm verify` 全绿(含后端 E2E)。
- 分支 `feat/T-V33-mapping-profile` 从 main 起、提交不合并;`git merge main` 拉平;只 add 本卡相关文件;完成发 `git diff --stat main`(含迁移如有)+ 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 可装一个映射 profile(声明依赖 室内 + modelica-thermal,或 sysml + mbse),在两端 profile 已应用的工作空间内定义 `room↦ThermalZone` / `requirement↦test_case` 等跨 profile correspondence 关系。
2. 每条对应挂字段映射 + 基数 + 方向;可经读端点查询。
3. 领域内普通关系仍限同 profile(跨 tv 仍拒);单 profile 项目零回归;verify 全绿。

## 跟进(本卡不做)
2c 映射视图;转换实际执行到 Modelica/FMI;映射覆盖率预投影(rm_correspondence)。
