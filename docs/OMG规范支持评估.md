# M-Next 对 OMG 规范的支持评估

- 依据:OMG 官方规范目录 https://www.omg.org/spec/ (实测 **总计 285 个规范**;ISO 采纳 16 个)。
- 评估日期:2026-06-19。基于当前 main(至 v1.27,联邦 fed-spec 已立、fed-1+ 进行中)。

## 0. 口径(重要,先说清)

本评估**不是"合规认证"**(M-Next 未做任何 OMG 一致性测试套件)。评的是**"底座能不能承载该规范、已实现到什么程度"**,分四档:

- **【实现-子集】** 已落地、端到端验证过的受控子集;
- **【可承载】** 底座(M2 元模型 + 泛化/重定义/值类型 + 规则 + 派生/计算 + 交换 SPI + M2M)能以 **profile/适配器** 形式承载,属增量工作,无根本障碍;
- **【缺执行语义】** 结构可承载,但该规范的**可执行/精确语义**目前无引擎(只有 SPI 挂载点);
- **【域外】** 与 M-Next 定位无关(中间件/运行时/传输协议/语言绑定),**不该做、也不打算做**。

关键前提:M-Next 是 **MOF 家族的"统一数据 + 建模"底座**。它的 OMG"射程"= **MOF 元模型/建模/profile 那一类**;CORBA/DDS/语言映射那一类是分布式中间件,与本平台正交。

## 1. 总览结论(分档计数,近似)

> OMG 类目相互重叠(一个规范可属多个类目),下列为**按相关性归并的近似量级**,非精确不相交计数。

| 档位 | 近似数量 | 说明 |
|---|---|---|
| **域外(中间件/运行时/协议/语言映射)** | **~120+** | CORBA 平台(27)+ CORBA 服务(21)+ CORBA 设施/安全/实时/嵌入(~7)+ 语言映射(16)+ 中间件(9)+ DDS 族(14)+ 各域的 CORBA 服务接口(健康/电信/金融里的 *Service*)。**M-Next 不涉及。** |
| **可承载(MOF 元模型/建模/profile/词汇)** | **~120-150** | Modeling(51)+ UML Profile(17)+ Software Modernization/CISQ(~26)+ Business Modeling(18)+ Systems Engineering(4)+ Systems Assurance(2)+ 部分域内数据模型/元模型。**底座可逐个 profile 化,增量。** |
| **实现-子集(已落地)** | **~5-6** | 见 §3 头部。 |
| **缺执行语义(结构可承载、引擎缺)** | **~5** | fUML / PSSM / PSCS / PSUM / ALF。 |

**一句话**:285 个里,**约一半是中间件/运行时(域外)**;另**约一半是建模/元模型(M-Next 的可承载射程)**;其中**真正已实现的是个位数(子集级)**;**可执行语义是最大空白**。

## 2. 按 OMG 类目 × M-Next 相关性

(类目计数取自官方目录;相关性为本评估判断。)

### Platform 组
| 类目 | 数 | M-Next 相关性 |
|---|---|---|
| **Modeling** | 51 | **核心射程**:MOF/UML/XMI/OCL/QVT/DD/fUML/PSSM/PSCS/KerML/SysML/UAF/SACM/SMM/KDM/ODM… 多数【可承载】,少数【实现-子集】,执行语义类【缺】 |
| **Uml Profile** | 17 | **可承载**:MARTE/NIEM-UML/SoaML(部分)等 = profile,底座的泛化/重定义/值类型正对口 |
| **Software Modernization** | 16 | 部分【可承载】(KDM/ASTM/SFPM 是元模型);逆向工程本体不在 MVP |
| **Language Mapping** | 16 | **域外**(C/C++/Java/Python… IDL 绑定) |
| **Middleware** | 9 | **域外** |
| **OMG DDS** | 14 | **拆分**:运行时/线缆协议(DDSI-RTPS、DDS-Security、transport、gateway)【域外】;数据中心模型/类型系统/QoS/拓扑(DDS-XTypes、DDS-XML/JSON)【可承载·与总线插件同类】 |

### Other 组(部分)
| 类目 | 数 | 相关性 |
|---|---|---|
| **Corba Platform / Services / 其它 Corba** | 27+21+7 | **域外** |
| **Domain**(总伞) | 113 | **混合**:数据模型/元模型【可承载】,CORBA 域服务接口【域外】 |
| **Cisq**(代码质量度量) | 10 | **可承载**(ASCQM/ATDM 等是度量元模型;非 MVP) |
| **Software Engineering** | 10 | 部分【可承载】(SPEM/Essence/RAS) |
| **Systems Engineering** | 4 | **核心**:SysML/SysPhS/SyM/SystemsModelingAPI |
| **Systems Assurance** | 2 | **可承载**:SACM/(RAAML) |
| **Real Time / Interface Definition Language** | 4+1 | **域外** |

### Domain 垂直组
| 类目 | 数 | 相关性 |
|---|---|---|
| Business Modeling | 18 | **多数可承载**:BPMN/DMN/CMMN/SBVR/BMM/VDML/BPDM/BACM/IFML/PRR = 元模型/notation |
| Healthcare / Lifesciences | 13+10 | **混合**:数据模型【可承载】,CORBA 服务(COAS/PIDS/CTS2…)【域外】 |
| Finance | 10 | **混合**:FIBO/FIGI/LCC 是**本体/词汇**(RDF/OWL 世界,部分可承载为数据,非原生本体);LEDG 等服务【域外】 |
| C4i / Space / Manufacturing / Robotics / Retail / Government / Transport | 10/7/7/6/5/5/2 | **混合**:元模型/数据模型(XTCE/SOLM/RTC/UPOS…)部分【可承载】,实时/接口服务【域外】 |

## 3. 核心建模族 — 逐规范状态

### 3.1 已实现(子集级,端到端验证)
| 规范 | 状态 | M-Next 实现 |
|---|---|---|
| **MOF / EMOF** | 【实现-子集】 | M2 元模型:类型/属性/泛化/重定义/值类型/关系(EMOF 核心建模概念);无完整反射 API/关联所有权全语义 |
| **OCL** | 【实现-子集·等价物】 | 规则 DSL(invariant/约束)+ 派生/计算层(导航 traverse、集合 sum/count/any/all、嵌套);**非 OCL 语法/标准**,功能覆盖约束+导出常用面(v1.26 验证) |
| **XMI** | 【实现-子集】 | SysML XMI 读写子集(XXE 安全);非通用 MOF-XMI |
| **SysML(v1)** | 【实现-子集】 | Block/Requirement profile + association + 良构规则 + XMI 导入,e2e 验证(v1.23);Port/参数化/分配未做 |
| **ReqIF** | 【实现-子集】 | 导入/导出/差异(v1.4) |
| **QVT / MOFM2T(M2M/M2T)** | 【进行中】 | 声明式 M2M 转换 DefineTransformation/RunTransformation(fed-spec 已立,fed-2 实现中);M2T 早有"快照→docx/HTML"输出(708) |

### 3.2 缺执行语义(结构可承载、引擎缺 = 最大空白)
| 规范 | 状态 |
|---|---|
| **fUML**(可执行 UML 基础子集) | 【缺】仅 SimulationEngine SPI(L0)可挂,无 fUML VM(L2 待,EPL 许可门) |
| **PSSM**(状态机精确语义) | 【缺】未做(L3,研究级) |
| **PSCS**(组合结构精确语义) | 【缺】未做 |
| **PSUM**(不确定性精确语义) | 【缺】未做 |
| **ALF**(基础 UML 动作语言) | 【缺】未做(我们的表达式引擎 ≠ ALF) |

### 3.3 可承载(profile 化,增量,尚未做)
| 规范 | 备注 |
|---|---|
| **UML(完整)** | 现仅结构子集;行为(活动/状态机/交互)未做 |
| **SysML v2 / KerML / SystemsModelingAPI** | 文本+自有 API,非经典 XMI;需专门适配器 + KerML 元模型 |
| **UAF / UPDM** | 国防体系架构 = profile,底座可承载(同 SysML 路线) |
| **MARTE / RAAML / SysPhS / SyM** | UML profile / 物理交互;profile 化可承载;SyM(SysML-Modelica)正对 Modelica 插件 |
| **KDM / ASTM / SMM / SACM / SPEM / Essence** | MOF 元模型,可承载 |
| **CWM / ODM / IMM** | 仓库/本体元模型(ODM 偏 RDF/OWL,部分可承载) |
| **BPMN / DMN / CMMN / SBVR / BMM / VDML / BPDM / IFML / PRR / DTV** | 业务建模 notation/元模型,可承载;notation 的图形语义(DD/DI)是额外工作 |
| **DD(Diagram Definition)/ DI / UMLDI / HUTN** | 图形/文本具体语法;M-Next 视图是自有 SDK,非 DD 标准 |
| **UML Profile ×17** | profile 化正对口(泛化/重定义/值类型已就绪) |
| **DDS 数据中心模型(DDS-XTypes / Topic / QoS / 拓扑)** | **与总线插件同一类**:Topic/数据类型/QoS 策略/reader-writer 拓扑 = profile + 关系 + 派生(带宽/时延)。**只建模分析 DDS 系统,不实现 DDS 中间件。** |

### 3.4 域外(明确不做)
CORBA 平台/服务/设施/安全/实时/嵌入(~56)、语言映射 ×16(C/C++/Java/Python/COBOL/Lisp/Smalltalk/Ada/PL1/IDL…)、Middleware ×9、**DDS 的运行时半边**(DDSI-RTPS 线缆协议、DDS-Security、transport、各 gateway/RPC)、各域 CORBA 服务接口(COAS/PIDS/CTS2/GEMS/TLOG…)。**这些是分布式中间件/传输/语言绑定,与"统一数据 + 建模"底座正交,不在路线内。**

> **关键澄清(DDS):** "建模一个 DDS 系统" ≠ "实现一个 DDS 中间件"。**建模/分析侧**(DDS-XTypes 类型系统、Topic/QoS/参与者拓扑、带宽时延分析)与总线插件同类,属【可承载】(见 §3.3);**运行时侧**(成为一个合规的 DDS 总线、跑 RTPS 协议)属【域外】。同理适用于其它"既有元模型、又有运行时接口"的规范——承载其元模型/数据模型,不实现其运行时。

## 4. 战略结论(对外口径)

1. **定位**:M-Next 是 **MOF 家族的统一数据 + 建模底座**,不是 OMG 全谱工具,更不是中间件(CORBA/DDS)。
2. **射程**:对 285 中**建模/元模型/profile 那约一半**有**结构承载力**(底座 + profile 机制);中间件那约一半**域外**。
3. **现状**:**已实现的是个位数子集**(MOF-like / OCL-like / XMI / ReqIF / SysML-v1-min / M2M 进行中),其中 SysML-v1 与总线 profile 已端到端验证。
4. **最大空白**:**可执行精确语义(fUML/PSSM/PSCS/PSUM/ALF)**——目前只有挂载 SPI、无引擎。这是从"建模"走向"可执行模型"的关键缺口。
5. **杠杆**:底座把"承载一个新 OMG 元模型"的成本大幅降低(定义 profile + 适配器 + 约束),所以**广度可增量铺开**;但**深度/保真/执行语义/合规认证**是每规范的硬功夫。

**稳妥的对外表述**:"以统一 MOF 底座支持 OMG **建模族**(MOF/UML/SysML/OCL/ReqIF/XMI 等)的**受控子集与互通**,profile 机制可增量承载更多元模型;M2M 转换进行中;**可执行语义(fUML 等)与一致性认证为后续路线**;CORBA/DDS 等中间件**运行时**不在范围。"——切忌说"支持 OMG 规范"。

## 5. 建议与优先级

**总原则:押深度 + 互通,不押广度。** "支持 285 中的 N 个"是陷阱——每个规范都是真功夫,合规认证无底洞,且对业务无直接价值。真正的差异化是**四插件端到端可跑且数据互通**(SysML block → Modelica block → 总线装备 → 带宽),这是单点工具(Cameo / Modelica 工具 / 总线工具)都没有的。规范数量不是卖点。

判据(决定一个规范要不要碰):**(a) 能否复用现有机制(profile + 关系 + 规则 + 派生 + M2M + 仿真 SPI),且 (b) 是否服务于四插件验证目标。** 两者皆是才做。

建议优先级:

1. **执行语义(fUML)——最高优先,因为它就是第 2 个插件。** 这是本评估"最大空白",也是"画图+校核"与"模型可执行(MBE)"的分水岭。需早决策:自研 fUML 子集 VM,还是外接引擎挂 SimulationEngine SPI(注意 EPL 许可门)。PSSM/PSCS 暂作研究级后置。
2. **锁死联邦互通端到端(fed-1/2/3)。** 让四插件数据真能互转(correspondence + M2M + provenance)。独特价值优先于铺新规范。
3. **总线 + DDS 作"同类两样本"一起验。** 非标总线(已做)+ 标准 DDS 数据中心架构 profile(增量,复用总线机制)。一套机制同时承载**非标**与**标准**总线,正好证明底座不是给某一种总线写死的——是有力的通用性验证论据,优于去碰无关规范。
4. **其余 OMG 建模规范**(UAF/MARTE/KDM/BPMN/DMN…)按需 profile 化,**不主动铺量**,客户/场景驱动再做。

不做清单(明确边界):CORBA/DDS 中间件**运行时**、语言映射、传输协议、一致性认证——不在路线内。
