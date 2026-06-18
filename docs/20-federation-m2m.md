# 20 — 跨 profile 联邦与 M2M 投影(收官)

状态:**设计稿(待确认)**。兑现"数据互相使用"愿景:同一实体在多 profile 里互引、IBD→总线图投影。前置:≥2 profile 已就位(SysML + 总线)、派生/计算层、命令入口。蓝本:验证场景备忘"跨插件数据互通"。

## 0. 目标(用户愿景拆解)

两件不同的事,分清:

- **跨 profile 身份**:一台"装备"= SysML Block = 总线节点(同一实体,多 profile 视角)。
- **M2M 投影**:SysML IBD(Block+Connector)**变成**总线图(节点+链路)——同源数据换镜头/按规则转换。

## 1. 两种机制(分别设计)

### A. 对应(Correspondence)= 跨 profile 身份

**用关系,不用多类型**。理由:data_object 单 object_type,多类型是大改;而"同一实体两个 profile 面"用一条 **correspondence 关系**(如 `realizes`/`corresponds`)连两个 profile-specific 对象即可,落在既有关系机制上,最小侵入、可追溯。

- 新增**跨 profile 关系类别**:source/target 可属**不同 profile 类型**(现有 relation_type 已支持任意端点类型,只需放行跨 profile)。
- 联邦查询/视图:给 A 侧对象,沿 correspondence 找 B 侧对象,组合呈现("此总线节点对应哪个 SysML Block")。

### B. M2M 投影(Transformation)= IBD→总线图

**可配置转换规则**:源 profile 类型/关系 → 目标 profile 类型/关系的映射,**经命令入口生成**目标模型 + 回填 correspondence 链。

- 映射规则(声明式,profile 级):`Block → node`、`Connector(carries 信号)→ bus_link`、字段映射(可复用派生表达式取值)。
- 执行:读源模型(读模型)→ 按规则生成目标对象/关系(CreateObject/CreateRelation 命令,AG-110)→ 建 correspondence(源↔目标)→ 记 provenance(哪次转换、哪条规则)。
- 幂等/重投影:同源重跑应更新而非重复(按 correspondence 找已生成目标);冲突/重叠**人定裁定规则**(BL-11),不静默覆盖。

## 2. 身份/重叠裁定(BL-11)

跨 profile 同一实体的判定是**人定规则**(按 code/外部 id/显式 correspondence),平台不猜。重叠(一个 Block 对多个节点)按规则展开或报冲突待人裁。

## 3. 红线

- **AG-110**:M2M 生成的目标模型经命令入口写(治理、可审计、走规则校验);**不绕过**。
- **可追溯**:correspondence + provenance(转换来源)必留,支持反查/重投影。
- **AG-105/101**:转换读源用读模型只读;不静默改源。
- **AG-301/501**:correspondence 关系类型/转换命令需契约 addendum(人发起)。
- 转换规则引擎复用派生/表达式引擎(取值/条件),生成走命令——不新造写路径。

## 4. 分级拆卡(逐卡封闭、串行)

| 卡 | 范围 | 价值 |
|---|---|---|
| **fed-spec**(人发起) | 契约:跨 profile correspondence 关系语义 + M2M 转换命令(DefineTransformation / RunTransformation)+ 错误码 | 打地基 |
| **fed-1 对应** | 放行/标注跨 profile correspondence 关系 + 联邦查询端点(A↔B 互查)+ 集成测试 | 同一实体多 profile 互引 |
| **fed-2 M2M 转换** | 转换规则定义(源→目标类型/关系映射)+ 转换执行(读源→经命令生成目标+correspondence+provenance)+ 幂等重投影 + 集成测试 | IBD→总线图 |
| **fed-3 大 e2e(收官验证)** | SysML profile 建 Block+Connector → 运行 M2M 投影 → 生成总线节点+链路(带 correspondence)→ 总线派生 total_load + 带宽规则判超 | **全栈贯通**:SysML+M2M+总线+派生+规则一条龙 |

## 5. 收官验证(fed-3)

一个项目里:SysML 侧建若干 Block 及其 Connector(信号流)→ `RunTransformation` 投影成总线图(每 Block→节点、每 Connector→消息/链路,带回指 SysML Block 的 correspondence)→ 总线侧派生 `total_load`、带宽规则判超限。**这把 SysML profile、M2M 转换、总线 profile、派生/计算、规则全焊成一条端到端链**,即"一份数据、多个工程镜头、互引不互拷"的实证。

## 6. 诚实定位

M2M 在原规格属 B/C 级"借鉴思路不引实现库"(docs/04 §1 行5)——本设计**不引外部 M2M 框架**,用平台自身(声明式映射规则 + 表达式引擎 + 命令入口)实现受控子集。联邦是收官能力,体量最大,**严格逐卡、JIT**;fed-1 先证身份互引,fed-2 再上转换,fed-3 收官。
