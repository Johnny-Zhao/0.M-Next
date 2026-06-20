# AI 上下文执行层 MVP — 设计稿(待人确认后才发实现卡)

> 状态:**设计征求**。蓝本:技术说明书 §3.4 / §7.5 / §7.10。核心机制是把"AI 输出"约束成**可预检、可对比确认、可回滚的变更集**,绝不绕过规则/权限/版本/确认(§3.4 红线)。依赖 RBAC(确认门)。契约新增需你拍板。

## 1. 为什么 / 边界

平台叫"数据驱动 + AI",AI 执行层是名义核心能力。关键不是"接个大模型",而是把 AI 产出**纳入现有 CQRS + 评审/确认 + RBAC** 的治理闭环:`选择 → 组装上下文 → AI 执行 → AI 变更集 → 规则/权限预检 → 用户对比确认/驳回 → 经命令写入 → 增量检查 → 审计`。

**关键设计取舍:平台只建"治理管道 + 变更集模型 + 动作 SPI",不绑定具体大模型厂商。** 真正调用 LLM 的实现挂在 `AiActionProvider` SPI 上(MVP 自带一个**确定式 stub provider** 供测试,真实 LLM provider 作为适配器后挂)。这样整层可测、可落地、无外部依赖、不被厂商锁定。

**非目标(本期)**:多轮对话 UI、向量检索/RAG、自动执行(必须人确认)、AI 直接写库(必须经命令)、真实 LLM 接入(SPI 留口,provider 另做)。

## 2. 核心流程(MVP)

```
1 选择范围(workspace + 选中对象/字段/关系 + 动作)
2 组装五类上下文(各有数据归属,见 §8):①技术管理流程(状态/评审/审计/权限/阶段)②技术流程(元模型/profile/规则集/派生/方法)③设计结果(对象/字段/关系/派生值/仿真结果/快照)④AI交互(SelectionRef/本次指令/会话内变更集)⑤AI底座(provider/Skill目录/提示策略/可重放参数)
3 AiActionProvider.execute(action, context) → 产出"建议变更"(propose,不落正式数据)
4 形成 AI 变更集(ai_change_set + items:每项=一个待确认命令式操作)
5 预检:对每项跑 ① RBAC(发起者档位是否够该写)② 规则(派生/校验/BLOCK 模拟)→ 标注可写/告警/否决
6 用户对比确认/驳回(整集或逐项);驳回即丢弃
7 确认 → 逐项**经命令入口**(CreateObject/UpdateFields/...)以发起者身份+REVIEWER 写入
8 写入后增量检查 + 正常审计/版本(走现成命令路径,天然留痕)
```

## 3. 关键决策(每条给推荐 + 备选)

### D1 AI 调用方式 —— 推荐:`AiActionProvider` SPI + 自带 stub
- 接口 `AiResult execute(AiAction action, AiContext context)`;MVP 自带 `StubAiActionProvider`(确定式:如"补全"=按字段定义/枚举给占位建议)供 e2e;真实 LLM provider 后挂。
- 备选:直接内嵌某 LLM SDK——引新依赖 + 外部网络 + 不可测,否(违 §8.6 AI 不阻塞、§7.15.3 重型不入主链)。

### D2 首批动作 —— 推荐:**1 写 + 1 读**
- 写:`SUGGEST_FIELDS`(对选中对象补全字段建议 → 变更集);读:`EXPLAIN_CHECK`(解释某检查结果,只读、不产变更集)。
- 其余(生成对象/关系、修复、汇总审阅、生成输出草稿)押后,同模式扩。

### D3 变更集模型 —— 推荐:新表 `ai_change_set` + `ai_change_item`
- set:`id`、`workspace_id`、`action`、`status(PROPOSED/CONFIRMED/REJECTED)`、`created_by`、`context_hash`、`provider`、`created_at`。
- item:`set_id`、`seq`、`op_type(CreateObject/UpdateFields/...)`、`payload(jsonb,命令式)`、`precheck(可写/告警/否决 + 详情)`、`item_status`。
- 走 CQRS:命令(ProposeAiChange / ConfirmAiChange / RejectAiChange)→ outbox → 投影 `rm_ai_change_*` 供只读查。

### D4 预检 —— 推荐:复用规则求值 + RBAC,**dry-run 不落库**
- 对每 item 的目标态跑派生/规则(模拟),BLOCK→标否决;RBAC 校验发起者能否写该类别。预检只读,结果存进 item。

### D5 写入 —— 推荐:**确认即重放为真实命令**
- `ConfirmAiChange` → 逐 item 以 `op_type+payload` 调既有命令(CreateObject/UpdateFields),发起者身份、需 REVIEWER 档位;失败回报、不半写(整集事务或逐项幂等)。
- **不新增写路径**:AI 不直接写主数据,一律经命令(AG-110)。

### D6 RBAC 衔接 —— `ProposeAiChange`=AUTHOR;`ConfirmAiChange`=REVIEWER(确认门);驳回=AUTHOR。**依赖 RBAC-A 先落地。**

## 4. 契约新增清单(**人确认项**)
| # | 新增 | 类型 |
|---|---|---|
| C1 | `AiActionProvider` SPI + `StubAiActionProvider` | 新 SPI + 自带实现 |
| C2 | 命令 `ProposeAiChange`/`ConfirmAiChange`/`RejectAiChange` + schema | 命令契约 |
| C3 | 读端点 `GET /workspaces/{wid}/views/ai-changes?...`(变更集+预检) | 查询契约 |
| C4 | `V17__ai_change.sql`(ai_change_set + item + rm_*) | Flyway |
| C5 | 错误码 `AI-4xx-`(provider 失败/预检否决/状态非法) | error-codes.yaml |
| C6 | 仿真/事件契约登记 AI 事件;夹具随契约 | 契约 + 夹具 |

## 5. 分期落地
- **Phase 1(MVP)**:变更集模型 + Propose/Confirm/Reject + 预检(规则+RBAC dry-run)+ Stub provider + `SUGGEST_FIELDS`/`EXPLAIN_CHECK` + 读端点 + e2e(选择→提议→预检标注→确认写入经命令→增量检查→审计;驳回丢弃;否决项不可确认)。
- **Phase 2**:真实 LLM provider 适配器、更多动作、上下文装配增强(RAG/历史资产)、AI 变更联动 UI。

## 6. 技术决断(由 Claude 定,2026-06;定位见 §7)
1. **SPI + 自带 Stub provider,真实 LLM 后挂** ✅ —— 整层可测、零外部依赖、不被厂商锁定。
2. **首批两动作:`SUGGEST_FIELDS`(写,走完整 propose→预检→确认→入库闭环)+ `EXPLAIN_CHECK`(只读)。** SUGGEST_FIELDS 是脊梁(证明"AI 作为受治理写入者"),EXPLAIN_CHECK 是低风险只读样例。
3. **确认写入门 = REVIEWER** ✅(对齐"AI 必须人确认")。
4. **拆 1a / 1b,1a 可与 RBAC 并行起步**:
   - **Phase 1a(不依赖 RBAC)**:变更集模型(V17)+ `ProposeAiChange`/`RejectAiChange` + 规则预检(dry-run)+ Stub provider + `SUGGEST_FIELDS` 提议 + `EXPLAIN_CHECK` + 只读端点。**确认写入暂不强制角色门**(或仅 actor 校验)。
   - **Phase 1b(依赖 RBAC-A 合并后)**:`ConfirmAiChange` 接 REVIEWER 确认门 + 写入重放为命令 + 增量检查。
5. **真实 provider 不进 MVP 主链(§7.15.3),仅留 SPI** ✅ —— 真实 LLM 调用走平台外 API(网络/密钥/合规),作为后挂适配器,与数据内核清晰边界。

## 8. 五类上下文 → 平台数据归属(context_hash 覆盖全部五类)

| 上下文 | 是什么 | 平台归属(数据/机制) | 对应架构层(§3) | 治理 |
|---|---|---|---|---|
| ① 技术管理流程 | 走到哪/谁批/哪些检查过/谁有权 | 状态模型、review/审批、`audit_log`、RBAC、`check_result`、11步阶段 | 业务应用层 + 基础支撑层 | 受治理·落版本审计 |
| ② 技术流程 | 这类工作按什么规矩/方法做 | 元模型(类型/字段/关系)、profile、规则集、派生定义、方法引擎 | 数据与规则底座层 | 受治理·版本化 |
| ③ 设计结果 | 已建/已算出什么 | 对象/字段/关系、派生值、`simulation_run` 结果、视图、快照 | 统一数据源(本体) | 受治理·落版本 |
| ④ AI 交互 | 此刻让 AI 做什么、聚焦在哪 | `SelectionRef`、本次 `AiAction`、会话内 `ai_change_set` 历史 | 用户交互层 | **临时**·不入主数据(§5.4.1) |
| ⑤ AI 底座 | 用哪个模型/工具/策略/参数 | `AiActionProvider`(provider+版本)、Skill 目录(现有 SPI 描述化)、prompt/策略、可重放参数(种子/温度/依赖版本) | AI 上下文执行层 | 留可重放记录 |

**关键不变量**:`context_hash` = 上述**五类上下文快照的哈希**;`ai_change_set.context_hash` + `provider` 一起,使任一 AI 产出可回答"在哪份数据、哪套规则、哪个流程态、哪个焦点、哪个模型+种子下生成"→ 可复核/回放/比对/回滚(§5.6 生成可重放对 AI 同样成立)。前三类是"受治理数据",后两类是"运行时上下文(临时,但进可重放记录)"。

---

契约 C1–C6 + 上述决断已定。**Phase 1a 可立即切卡并与 RBAC 并行**;1b 等 RBAC-A 合并。建议子卡:1a-模型+提议+预检+stub / 1b-确认门+写入。`AiContext` 装配器按 §8 五类各自取数。

## 9. `AiContextAssembler` 实现设计(AI-1a 蓝本)

**结构**:`AiContext(ManagementCtx ①, ProcessCtx ②, ResultCtx ③, InteractionCtx ④, SubstrateCtx ⑤, String contextHash)`,五个子 record 字段见 §8。

**装配器** `AiContextAssembler.assemble(workspaceId, actorId, AiActionRequest) → AiContext`,**只读、有界**,各类从现成读侧取:
| 类 | 现有组件(只读) | 1a 必填字段 | 1a 可后补 |
|---|---|---|---|
| ① | `ReadModelRepository`、`CheckResultRepository`、`audit_log`、(`RbacRepository`) | 选中对象 status、范围内活跃 check_result | role(RBAC 后)、review 态、audit |
| ② | meta 读、`RuleDefRepository`、`DerivedFieldRepository`、`SimEngineRegistry` | 选中类型 fieldDef、适用 ruleDef | 派生定义全集、方法 schema、templateVersion |
| ③ | `ReadModelRepository`、`DerivedEvaluator`、`SimulationRunRepository` | 选中对象字段(存储+派生) | 1 跳关系、最近 run、snapshot |
| ④ | 请求载荷 + `rm_ai_change` | SelectionRef、AiAction、instruction | 会话内提议历史 |
| ⑤ | `AiActionProvider.descriptor()`、`SkillRegistry` | providerId+版本、可重放参数 | 完整 Skill 目录、prompt 策略 |

**有界**(AG-202/203):选中对象 ≤N、邻域 1 跳、check_result/run 取最近 K、Skill 目录有上限。
**`contextHash`**:五子上下文规范化(键排序)→ SHA-256;前三类(受治理)+ 后两类(运行时 provider/seed/temp)**全进哈希**,落 `ai_change_set.context_hash`(§5.6 可重放)。
**RAG**:1a 仅结构化检索;非结构化(资产/文档)走 `Retriever` SPI(留口,1a 不实现向量)。
**接入**:`ProposeAiChange → assemble → AiActionProvider.execute → 落 ai_change_set+items → 逐项规则 dry-run 预检 → 投影 rm_ai_change → 读端点`。
