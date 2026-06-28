# 设计稿 — Profile / Stereotype:类型按 Profile 隔离 + 跨域映射(三阶段)

## 0. 模型主张(UML DSL 思想)
- **Profile** = 一个领域插件 = 命名空间/包。每个 profile 是一份独立模型。
- **Stereotype** = profile 内定义的对象类型。身份 = **(profile, code)**,而非全局 code。
- **跨 Profile 映射关系** = 不同 profile 的 stereotype 之间的(映射/对应)关系,用于追溯、转换、覆盖。

不同 profile 各有名为 `requirement` 的 stereotype 完全合法——它们是不同 profile 下的不同 stereotype,可并存、可互相映射。

## 1. 代码现状映射(平台已走一大半)
| UML 概念 | 平台实体 | 现状 |
|---|---|---|
| Profile | `template_version`(模板版本) | 已有;object_type/field_def/rule_def/relation_type/value_type 均带 `template_version_id` |
| Stereotype | `object_type` | 已有 |
| Profile 内字段/派生/规则 | field_def / derived_field / rule_def | 已归属 profile |
| Profile 间映射 | `m2m_transformation`(correspondence_relation_code + object_mappings + relation_mappings)、CorrespondenceView | 雏形已实现(模型转换/交换) |

## 2. 元模型各元素的唯一性现状(已核实)
| 元素 | 当前身份维度 | 实现层 | 阶段一是否需改 |
|---|---|---|---|
| `object_type` | (workspace, code) | 应用层(无 DB 约束) | **是**,改 (workspace, tv, code) |
| `relation_type` | (workspace, code) | 应用层 | **是** |
| `value_type` | (workspace, code) | 应用层 | **是** |
| `field_def` | (object_type_id, code) | DB `UNIQUE(object_type_id, code)` | 否(随 object_type 隔离) |
| `derived_field` | (object_type_id, code) | DB `UNIQUE(object_type_id, code)` | 否 |
| `rule_def` | (workspace, rule_code) | **DB `UNIQUE(workspace_id, rule_code)`** | 阶段一不动(现有领域规则码不撞);**阶段三迁移**为 (workspace, tv, rule_code) |

> tv = template_version_id(= profile)。

**核心结论:** 解锁多领域(阶段一)只需把 object_type / relation_type / value_type 的**应用层身份**加上 tv 维度,**零迁移**;rule_def 的 DB 约束留到阶段三补强(在那之前两 profile 不可有同名规则码,这是阶段一的已知约束)。

---

## 阶段一 — Profile 内类型唯一(解锁多领域)
**目标:** 同一作者空间内,不同 profile 可有同名 stereotype;MBSE 及任意同名码领域可装。

### 改动清单(kernel,应用层,零迁移)
1. `MetaModelRepository`:
   - `objectTypeByCode(workspaceId, code)` → 增 tv 维度重载 `objectTypeByCode(workspaceId, tv, code)`(保留旧签名给"单 profile 工作空间"读路径)。
   - 同理 `valueTypeByCode`、relation_type 的 EXISTS/byCode。
   - 唯一性 EXISTS(`object_type/value_type/relation_type WHERE workspace_id=? AND code=?`)→ 加 `AND template_version_id=?`。
2. `DefineObjectTypeHandler`:
   - 复用/唯一性判定按 (workspace, tv, code);
   - parentTypeCode 解析限定在**同一 tv 内**(已有 `metaParentCrossTemplate` 概念,天然契合);
   - replay 回放查 objectTypeId 时带 tv。
3. `DefineRelationType` / `DefineValueType` handler:同样按 tv 维度判重与解析端点类型(源/目标 object_type 在**本 profile**内按 code 解析)。
4. `ProfileLoader`:install 内部解析端点/父类型时,把 versionId 传入新的按-tv 查询(它本来就有 versionId 上下文)。

### 不受影响(已确认)
- **实例化**:instantiate 把单个模板元模型拷进新工作空间;项目工作空间内只有一个 profile,(workspace, code) 仍无歧义,读路径/读模型/视图**零改**。
- 室内、技术方案 demo:类型码本不撞,行为零变化。
- field_def / derived_field:随 object_type 自动隔离。

### 验收
- 作者空间内同时装室内 + 技术方案 + MBSE,三者各自的 `requirement` 独立存在、互不覆盖。
- DOMAIN3-LIVE 重新派发即可点亮 MBSE;首页三领域;demo 全部零回归;`corepack pnpm verify` 全绿(含后端 E2E:新增"两 profile 同名 stereotype 共存"用例)。
- **已知约束(阶段三前):** 两 profile 不可有同名 `rule_code`(rule_def DB 约束未改);当前三领域满足。

### 红线
触及 kernel 元模型身份语义,人工发起。零迁移、不碰实例化/读模型/视图、现有 demo 零回归、verify 全绿、幂等不破坏。命中即停。

---

## 阶段二 — 跨 Profile 映射(多 profile 项目 + 映射 profile)
**目标:** 一个项目可同时应用多个 profile(模块),并通过**专门的映射 profile**在不同 profile 的 stereotype 间建立**元模型层**对应关系,配套**映射视图**。对标 SysML4Modelica(SysML 本身即一套 UML profile)。

### 已拍板的三个决定
1. **宿主 = 专门的映射 profile**(不挂项目层散放)。
2. **映射在元模型层**(stereotype↔stereotype),实例转换是套用类型规则。
3. **要映射视图**(双栏 stereotype 对应 + 实例下钻覆盖/过期)。

### 验证场景代入(压测设计)
| 场景 | 源 profile | 目标 profile | 映射 profile 内的对应(元模型层) |
|---|---|---|---|
| 室内→热仿真 | interior-design | modelica-thermal | room↦ThermalZone(area→floorArea、volume=area×层高);adjacent↦HeatConduction;window_area→Window.area |
| SysML→Modelica | sysml | modelica | Block↦Model;Part↦Component;FlowPort↦Connector;ConstraintBlock↦equation;BindingConnector↦connect |
| 需求→验证 | sysml | mbse | requirement↦test_case(沿 satisfy/verify 追溯,看覆盖) |

场景确认:三个决定都成立;且现有 `m2m_transformation.correspondence_relation_code` 正是"元模型层那条对应关系"留的钩子——本设计把它补成跨 profile relation_type 即闭环。

### 2a. 多 Profile 项目(前置,当前缺)
现状:workspace 只实例化**一个**模板;无"项目挂多模块"结构。需引入:
- **`workspace_profile` 关联**(workspace_id, template_version_id, applied_at, …):记录工作空间应用了哪些 profile。一次迁移(新增表,加性)。
- 允许向已有工作空间**追加** profile(即需即装):把该 profile 元模型并入该空间命名空间(阶段一的 tv 隔离是前提——同空间多 profile 才不撞)。

### 2b. 映射 profile + 跨域对应关系
- **映射 profile**:一种特殊 profile,**不定义领域 stereotype**,而是定义**跨 profile 的 correspondence relation_type**(源 stereotype ∈ profile A,目标 ∈ profile B)。声明对源/目标 profile 的**依赖**(装映射 profile 要求两端领域 profile 已装)。
- **放开点**:relation_type 源/目标必须同 tv 的隐含约束,**仅对映射 profile 内的 correspondence 关系**开放(领域内普通关系仍限同 profile)。映射关系打标 `kind=correspondence`。
- **每条对应关系挂明细**(复用 m2m_transformation 的 object_mappings/relation_mappings):**字段对应 + 转换表达式**(area×层高→volume)、**基数**(1:1 / N:1 / N:M)、**方向**(源→目标做转换;反向供追溯/影响分析)。
- **标准库 profile**:Modelica、SysML 作为大型"库 profile"从能力市场装(手写 manifest 或从标准元模型导入,见待定项)。

### 2c. 映射视图(perspective)
- 双栏:左源 profile stereotype、右目标 profile stereotype,中间画对应连线(元模型骨架,**小而稳**)。
- 下钻:点某条对应→实例级覆盖列表(哪些 room 已映射 ThermalZone / 未映射 / **已过期**)。
- 过期:源对象版本 > 映射锚定版本即"脏",接平台既有版本/血缘机制。

### 性能 / 复杂度护栏(守住这 4 条,视图切换不被拖慢)
1. **转换执行永远异步**:M2M 转换走事件/outbox→投影,**绝不进视图切换的同步请求**;视图只读结果,不现算。
2. **映射覆盖预投影成读模型**(`rm_correspondence`):映射视图读预算好的"已映射/未映射/已过期",不实时 JOIN 源×对应×目标。
3. **profile 作 rm_object 上的廉价过滤/分组键**(object_type→profile),建索引;默认单 profile perspective,不默认全量展开。
4. **映射视图:类型骨架预加载(小),实例覆盖懒加载分页**。
> 复杂度增量主要落在阶段二(多 profile、跨域关系、映射视图、过期检测)。单领域内的图/表/矩阵切换走只读零拷贝 rm_*,在元模型改动的热路径之外,**零拖慢**。

### 验收(暂定)
- 一个项目可应用 ≥2 个 profile;读模型/视图能区分并展示各 profile 对象。
- 可在映射 profile 内定义 room↦ThermalZone / requirement↦test_case 等元模型对应;映射视图呈现"已映射/未映射/已过期";下钻到实例覆盖。
- 单 profile 项目零回归;视图切换延迟无可感退化;verify 全绿(含迁移测试)。

### 红线
含迁移(workspace_profile / rm_correspondence)+ 放开映射 profile 内 relation 端点跨 tv 语义,人工发起。迁移仅新增、既有数据零破坏;领域内普通关系语义不变;单 profile 行为零回归;转换不得进同步视图路径。

---

## 阶段三 — DB 约束补强 + 作者空间解耦(收口)
**目标:** 把阶段一的应用层隔离落到 DB 约束,消除历史混用。

### 改动
1. **DB 唯一约束**(迁移,加性/替换):
   - `object_type`、`relation_type`、`value_type` 增 `UNIQUE(workspace_id, template_version_id, code)`(此前应用层已保证,加约束是补强,需先确认存量数据满足)。
   - `rule_def`:`UNIQUE(workspace_id, rule_code)` → **改为** `UNIQUE(workspace_id, template_version_id, rule_code)`(解除阶段一遗留的"规则码不可跨 profile 同名"限制)。一次迁移。
2. **作者空间 ↔ demo 解耦**:`AUTHOR_WORKSPACE` 当前与室内 demo 共用 `11111111`(历史混用)。改为:作者空间用独立保留 UUID(隐藏,不进 `/views/workspaces`);室内 demo 改为正常实例化的独立工作空间。`ProfileLoader` + `DevSeedRunner` + 工作空间列表过滤同步。
3. **namespace `::` 形式化**(可选):对外展示/检索时用 `profile::code` 全限定名,内部仍用 (tv, code) 主键;为能力市场/跨域引用提供稳定标识。

### 红线
含迁移 + 改约束 + 动作者空间装载语义,人工发起。迁移须存量数据零破坏、可回滚;先验证存量满足新约束再加;现有功能零回归;verify 全绿。

---

## 4. 阶段依赖与排期
- **阶段一**(零迁移,kernel 身份)→ 立即解锁多领域,DOMAIN3-LIVE 可重派。**优先做。** 无 OMG 借鉴依赖。
- **阶段二**(多 profile 项目 + 映射 profile)→ 依赖阶段一;2a(多 profile 项目)先于 2b(映射 profile)先于 2c(映射视图)。三个核心决定已拍板;**唯一待定**:标准库 profile(Modelica/SysML)是手写 manifest 还是配"元模型导入器"从标准元模型导入。
  - **OMG 借鉴(已定走)**:2b 映射语义**采用 QVT-Relations 声明式范式**——映射 = 源↔目标声明式对应 + when/where 条件 + key 匹配 + 双向可追溯(落到 m2m_transformation 的 object/relation_mappings),不写命令式脚本。
  - 待定项的标准答案:UML/SysML 侧用 **XMI 导入器**,Modelica 走 .mo + 标准库;映射视图布局可参考 **DD/DI**;转换方向用 **MDA PIM→PSM** 词汇校准。
- **阶段三**(DB 约束 + 作者空间解耦)→ 收口补强,依赖阶段一(语义)、与阶段二可并行。
  - **OMG 借鉴(已定走)**:作者空间/分层解耦按 **MOF 严格 M3/M2/M1 分层**指导;长期对外接口对标 **SysML v2 API & Services**(Project=工作空间 / Commit=版本快照 / Element=对象 / Query=视图)。

### 横切轨道 — 表达式语言:OCL 受限子集(已定走,跨三阶段)
- **范围**:把规则 `when`、派生 `derivation`、阶段二映射 `when/where` 统一成**受 OCL 启发的受限子集**(导航/集合操作/布尔/算术),替掉现自研 DSL。
- **策略**:保留现有求值器接口,**渐进替换、不必一次到位**;先并行支持新旧语法,逐条迁移规则/派生。
- **收益**:语义有规范可依、可静态校验;未来 XMI 导入 SysML/UML 模型时其 OCL 约束可直接复用。
- **定位**:独立横切轨道,不阻塞阶段一;建议在阶段二落地映射条件时一并把表达式层切到 OCL 子集。

> 注:以上 OMG 借鉴均为**设计决策已定**;具体实现卡(OCL 子集求值器、QVT 式映射定义、XMI 导入器)在各阶段真正派发时再按封闭清单拆分,不在此预先开卡。

## 5. 阻塞复盘(DOMAIN3-LIVE 为何停)
DOMAIN3-LIVE 按"仅扩 DevSeedRunner、零写入语义变更"红线执行;点亮 MBSE 必然触发 object_type 身份冲突,修复需动 kernel 身份语义,超出该卡封闭清单。Codex 命中红线正确停下、未夹带。本设计稿即根因与正解;DOMAIN3-LIVE 应在**阶段一**落地后重新派发。
