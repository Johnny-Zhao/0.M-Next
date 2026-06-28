# 评估稿 — OMG 标准/技术/思想对 M-Next 的借鉴

> 目的:全局检查 OMG 体系(MOF/UML/SysML/OCL/QVT/XMI/ReqIF/DD/SMM…),哪些规范、技术、思想可以借鉴优化本平台。
> 立场:我们已经走在 UML Profile/Stereotype 的路子上,且已用 ReqIF 做交换——许多 OMG 思想我们是"同源自发",借鉴成本低、收益高。

## 0. 一句话结论
平台的元模型层(profile=元模型、stereotype=类型、映射 profile=转换)几乎就是 **MOF + UML Profile + QVT** 的工程化落地。最值得优先借鉴的四样:**OCL(约束/派生表达式语言)**、**QVT(声明式映射语义,喂阶段二)**、**SysML v2 API & Services(模型访问 API 北极星)**、**XMI(标准模型导入,解阶段二"导入器"待定项)**。

## 1. 体系映射:OMG ↔ M-Next
| OMG | 是什么 | 对应我们哪块 | 现状 |
|---|---|---|---|
| **MOF**(Meta-Object Facility) | 元元模型,M3 层 | profile 元模型的"元模型"(类型/字段/关系/派生/规则的 schema) | 隐式已有,未显式分层 |
| **UML Profile / Stereotype** | 轻量扩展机制 | profile=template_version、stereotype=object_type | ✅ 已采纳 |
| **OCL**(Object Constraint Language) | 约束/查询/派生表达式 | 规则引擎 `isBlank(field(...))`、派生 `count(traverse(...))` | 自研 DSL,可标准化 |
| **QVT**(Query/View/Transformation) | 模型→模型转换标准(关系式/操作式) | 映射 profile、m2m_transformation | 雏形,语义可对标 QVT-R |
| **XMI** | 基于 XML 的模型交换 | 标准模型(SysML/UML)导入导出 | 缺;ReqIF 只覆盖需求 |
| **ReqIF** | 需求交换(OMG 标准) | exchange/reqif | ✅ 已用 |
| **SysML v1/v2** | 系统建模语言(本身是 UML profile) | 一个领域库 profile | 规划中 |
| **KerML 1.0** | SysML v2 的语义/句法基础 | 元模型语义底座 | 可借语义思想 |
| **SysML v2 API & Services 1.0** | 标准化模型访问/持久化/查询/校验 REST API | 我们的 CQRS 命令/视图 API | 强烈可对标 |
| **DD/DI**(Diagram Definition/Interchange) | 图形布局交换标准 | 图/平面图视图、设计交付 | 缺,可补 |
| **SMM**(Structured Metrics Metamodel) | 结构化度量元模型 | 派生/覆盖/质量指标 | 可标准化 |
| **fUML / Alf** | 可执行 UML 语义/动作语言 | 行为/流程执行(若做) | 远期 |
| **BPMN/DMN/CMMN** | 流程/决策/案例管理 | profile 的"流程"切面 | 远期领域 |
| **MDA(CIM/PIM/PSM)** | 模型驱动架构分层 | "一套模型多重表达 + 向 Modelica/SysML 转换" | 思想已暗合 |

## 2. 高价值借鉴(优先级排序)

### P0 — OCL 作为约束/派生表达式语言
- **借什么**:用 OCL(或受 OCL 启发的受限子集)统一表达规则 `when`、派生 `derivation`、映射条件。OCL 有完整规范、求值语义、类型系统,业界工具/教材成熟。
- **对应**:现规则 `isBlank(field('responsibility'))`、派生 `count(traverse('proposal_contains_module','out'))` 是自研 DSL,语义靠实现定义、难移植难校验。
- **收益**:表达力与可验证性一步到位;未来导入 SysML/UML 模型时其约束(OCL)可直接复用;降低"规则语义靠读代码"的风险。
- **代价/风险**:全量 OCL 重;建议**取 OCL 受限子集**(导航、集合操作、布尔/算术),保留现有求值器接口,渐进替换。**不必一次到位**。

### P0 — QVT 声明式映射语义(喂阶段二映射 profile)
- **借什么**:QVT-Relations 的"关系式声明映射"思想——映射是**源模式↔目标模式的声明式对应**(含 when/where 条件、key 匹配、双向可追溯),而非命令式脚本。
- **对应**:阶段二映射 profile 的 correspondence relation + 字段映射,正好可按 QVT-R 的"relation + domain pattern"建模;m2m_transformation 的 object_mappings/relation_mappings 即其落地。
- **收益**:映射可声明、可追溯、可双向(转换 + 覆盖/影响分析一套);对标工业界(SysML4Modelica 的转换正是这种范式)。
- **代价**:QVT 全规范庞大,取其**声明式 + 可追溯**核心思想即可,不实现整套 QVT 引擎。

### P1 — SysML v2 API & Services 作为模型访问 API 北极星
- **借什么**:SysML v2 API & Services 1.0(2025 终版)定义了标准化的**模型访问/持久化/查询/校验/版本(commit/branch)** REST 接口与 **Project/Commit/Element** 资源模型。
- **对应**:我们已是 CQRS(命令写 + 视图读)+ 版本/快照/血缘;概念高度重合。
- **收益**:对标其资源模型(Project=工作空间、Commit=版本/快照、Element=对象、Relationship=关系、Query=视图),让平台**与 SysML v2 工具生态可互操作**;其 Query/Projection 思想可校准我们的视图 API。
- **代价**:不必实现整套;**对齐资源命名与语义**,在边界做适配层即可。

### P1 — XMI 标准模型导入(解阶段二"导入器"待定项)
- **借什么**:用 XMI 导入 UML/SysML(v1)标准元模型与模型;SysML v2 走其 textual 表示 + API。
- **对应**:阶段二"标准库 profile(Modelica/SysML)手写还是导入"的待定项——**XMI 即 UML/SysML 侧的标准答案**;Modelica 走其自有文本格式(.mo)+ 标准库。
- **收益**:不手写大型标准 manifest;从权威元模型生成 profile。
- **代价**:需一个"元模型导入器"子项(XMI→profile.manifest 映射);中等工作量,建议阶段二附带、可后置。

### P2 — DD/DI 图形交换 + SMM 度量
- **DD/DI**:图/平面图的布局可按 Diagram Interchange 持久化/交换,利于设计交付与跨工具往返。
- **SMM**:把覆盖率、规则命中、质量指标用结构化度量元模型表达,便于跨领域统一"覆盖/合规"仪表。
- 优先级低,锦上添花。

## 3. 思想层面的校准(不一定写代码,但应内化)
- **严格 M3/M2/M1 分层(MOF)**:显式区分"元模型的元模型 / profile 元模型 / 实例模型"三层,避免概念混用(如当前作者空间与 demo 工作空间混用就是分层不清的征兆——阶段三已计划解耦)。
- **Profile 应用语义(UML)**:UML 里 profile 是"应用(apply)"到模型上的,可叠加、可撤销、required/optional 扩展——正对应我们"即需即装/可装卸"与阶段二"多 profile 项目"。借鉴其 **profile application + import 依赖**语义。
- **MDA 的 PIM→PSM 转换链**:我们"一套模型→Modelica(仿真)/SysML(系统)/文档"本质是 PIM 到多个 PSM 的转换。用 MDA 词汇校准"映射 profile"的定位与方向。
- **KerML 语义基**:SysML v2 用 KerML 给"特性/类型/关系"一个统一语义底座;我们的元模型若想长期严谨,值得借其"以 feature/type 为统一基元"的思路审视类型/字段/关系是否同根。

## 4. 反向提醒:不要过度对齐
- OMG 规范以**完备性**为先,工程上常**过重**(QVT/全 OCL/UML 全集)。我们的优势是**轻、数据驱动、CQRS 快切视图**——借**思想与语义**,而非照搬整套元模型与引擎。
- 任何借鉴都先过平台红线:写入经命令入口、视图只读零拷贝、契约/迁移人工发起、转换异步不进同步视图路径。
- 优先级再强调:**OCL 子集 + QVT 声明式映射思想**最快见效且直接服务阶段二;**SysML v2 API/XMI**作为互操作与导入的中期北极星。

## 5. 与三阶段路线的衔接
- 阶段一(profile 隔离):无须 OMG 借鉴即可做,先行。
- 阶段二(映射 profile):**直接吸收 QVT 声明式映射 + XMI 导入 + MDA PIM/PSM 词汇**;映射视图可参考 DD/DI。
- 阶段三(收口):借 **MOF 严格分层**指导作者空间/分层解耦;长期可对标 **SysML v2 API** 校准对外接口与资源模型。
