# 阶段3 设计稿 — 规则 DSL、预检与契约测试

状态:**设计稿(待用户确认)**。对应总控计划 §三·阶段3。本稿只做定义,不写实现代码。

## 0. 目标与边界

**目标**:把 D.3 规则 DSL 的受控子集落为可运行能力——

1. 规则定义作为 **M2 制品**(随场景模板/工作空间定义、发布即不可变版本);
2. **纯求值器**(解析 + AST + 沙箱 + 函数白名单,禁 `eval`);
3. **热路径轻量预检**接入命令入口(编辑即时反馈,`BLOCK` 阻断写入,`RULE-422`);
4. **冷路径全量检查**(worker,写 `check_result`,有界查询端点);
5. 契约测试矩阵(规则命令 Schema + 规则结果 Schema + 沙箱逃逸)进 CI。

**不做(本阶段明确排除,越界即判废)**:

- OCL / SHACL 实现;
- 增量检查的依赖图优化(热路径只跑"匹配 scope 的轻量规则",冷路径先做全规则全匹配,不做脏集传播);
- **自动修复执行**(`fix` 仅声明,永不运行);
- 跨工作空间规则、规则市场、可视化规则编辑器(后置)。

## 1. 概念落点(M2 层,B 级对齐)

规则是**类型系统的一部分**,与 `object_type`/`field_def` 同层,**不是主数据**。一条规则约束"某对象类型(可再过滤到字段)在何条件下违例"。

```
scene_template/workspace
  └── object_type (code)
        └── rule_def (code, scope=本类型[, fieldCode], severity, when, message, impact, suggest, fix-decl)
```

- 规则随模板**发布即版本锁定**(沿用阶段2"发布不可覆盖");草稿态可改,发布态只能新版本。
- `scope` 只能引用**已发布**的 `object_type.code` 与该类型下的 `field_def.code`;引用不存在即定义期拒绝(`RULE-422-SCOPE-UNRESOLVED`)。

## 2. DSL 封闭语法(D.3 子集)

一条规则的字段是**封闭集合**,新增字段必须改契约:

| 字段       | 必填 | 取值 / 说明                                                                          |
| ---------- | ---- | ----------------------------------------------------------------------------------- |
| `code`     | 是   | 工作空间内唯一规则标识(稳定键)                                                     |
| `scope`    | 是   | `{ objectTypeCode, fieldCode? }`;无 `fieldCode`=对象级,有=字段级                   |
| `severity` | 是   | `BLOCK` \| `WARN` \| `INFO`(仅 `BLOCK` 阻断热路径写入)                              |
| `when`     | 是   | 布尔**表达式**(见 §3);求值为 `true` 即"命中违例"                                   |
| `message`  | 是   | 模板串,支持 `${field('code')}` 占位(只读插值,不二次求值)                          |
| `impact`   | 否   | 声明性:受影响对象/字段清单(给人看,不驱动级联)                                     |
| `suggest`  | 否   | 声明性修复建议文本                                                                   |
| `fix`      | 否   | **仅声明**(结构化建议,如"设默认值 X");**引擎永不执行**,留给 AI/人工走命令入口     |
| `lightweight` | 是 | 布尔;`true`=热路径预检候选(见 §4 约束);`false`=只在冷路径跑                       |

## 3. 表达式语言与沙箱

**设计原则:能力最小化、纯函数、可终止、无副作用、无外部访问。**

- **语法**:字面量(数/串/布尔/null)、字段引用 `field('code')`、比较 `== != < <= > >=`、逻辑 `&& || !`、括号。**无赋值、无循环、无 lambda、无成员任意访问、无 `eval`/反射。**
- **函数白名单**(封闭集合,新增须改契约):
  - 标量:`isBlank(x)`、`length(x)`、`matches(x, '正则')`、`toNumber(x)`、`inSet(x, 'a','b',…)`、`coalesce(x, y)`;
  - 关系(**有界**):`relationCount('relationTypeCode')`、`hasRelation('relationTypeCode')`——只读、只查当前对象的直接关系,**带上限**(超限即视为不可在热路径求值→降级冷路径)。
  - 正则用安全引擎并设长度/回溯上限,防 ReDoS。
- **求值上下文**:只读注入"当前对象的字段值映射 + 类型元信息 + 有界关系计数";**求值器不持有任何写句柄、不发起 IO、不读其它对象明细**。
- **可终止性**:AST 无循环结构,深度有上限;单次求值步数设硬上限,超限抛 `RULE-422-EVAL-LIMIT`(降级而非崩溃)。
- **沙箱逃逸测试**(必测):构造含反射式串、超长正则、深层嵌套、未知函数名、跨对象探测的 `when`,断言一律被解析期拒绝或求值期安全降级,**绝不触达主数据写路径或文件/网络**。

求值器是**纯组件**,落 `packages/engines/rules`(无 spring/jdbc,与 output/exchange/sim 引擎同型,亦为阶段8 BL-01 的第 4 个"读模型→解释→产物"实例)。

## 4. 执行模型:热路径 vs 冷路径(8.5 铁律)

> 8.5:**不得每次编辑就全量检查。**

**热路径(命令预检,同步,P4 挂点)**

- 触发:`CreateObject` / `UpdateFields` / `ChangeState` 等改对象的命令。
- 范围:**只跑** scope 命中"被改对象的类型"**且** `lightweight=true` 的规则,对**该单个对象**的(当前∪提案)状态求值。**绝不扫描其它对象、绝不全规则集。**
- 结果:任一 `BLOCK` 命中 → 抛 `RULE-422-RULE-VIOLATION`,**事务不提交、无写入、无 outbox**(AG-201);`WARN`/`INFO` 不阻断,随命令响应回带(供 UI 提示)。
- 约束:`relationCount/hasRelation` 在热路径有调用上限;超限的规则**不得**标 `lightweight=true`(定义期校验拒绝),保证热路径不退化。

**冷路径(worker,异步,task_queue)**

- 触发:显式"全量检查"请求,或大批量/结构性变更后入队(AG-207)。
- 范围:对给定 scope/工作空间跑**全部**匹配规则(含 `lightweight=false`)。
- 产出:写 `check_result` 行(派生输出制品,非主数据);记录 `config_hash` + 输入快照基准(可追溯,AG-208 风格)。
- 禁:`sleep`(AG-504);worker 不写主数据(AG-105)。

## 5. 数据结构

> 迁移号:kernel 与 server 共用一条 Flyway 历史(当前 max = `V8`),新迁移必须 `≥V9`,否则 Flyway 判为乱序拒绝。故 `rule_def` = **`V9`**、`check_result` = **`V10`**(放各自所属模块的 migration 目录,版本号全局递增)。卡阶段以仓库实测 max 为准再定。

**`rule_def`(M2,迁移 `V9__rules.sql`)**——定义态/发布态;`when_ast` 存解析后规范化 AST(JSONB),`when_src` 存原文。

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID PK | |
| workspace_id | UUID | |
| object_type_id | UUID FK→object_type | scope 宿主类型 |
| field_def_id | UUID FK→field_def NULL | 字段级时非空 |
| code | TEXT | 工作空间内唯一 |
| severity | TEXT | BLOCK/WARN/INFO |
| when_src | TEXT | DSL 原文 |
| when_ast | JSONB | 规范化 AST(求值用) |
| message | TEXT | 模板 |
| impact / suggest / fix_decl | JSONB NULL | 声明性 |
| lightweight | BOOLEAN | |
| published | BOOLEAN | 发布即不可覆盖 |
| version | BIGINT | |

**`check_result`(冷路径输出,server 迁移 `V9__check_result.sql`)**——非主数据,INSERT-only。

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID PK | |
| workspace_id / object_id / rule_id | UUID | |
| rule_code / severity | TEXT | 冗余存,便于查询展示 |
| message | TEXT | 已插值 |
| run_id | UUID | 一次冷路径运行 |
| config_hash | CHAR(64) | 规则集+范围指纹 |
| created_at | TIMESTAMPTZ | |

查询端点 `/views/check-results`(分页/范围,AG-202/203;只读零副本 AG-101)。

## 6. 命令、契约与错误码(需人发起的 spec-change)

**新增命令(meta-commands 家族,沿用阶段2 模板命令风格)**:`DefineRule`(草稿增改)、`PublishRule`(发布锁版)、可选 `RunRuleCheck`(触发冷路径,或走通用任务入口)。

**契约 addendum(AG-301/501,人发起)**:

- `contracts/规则命令契约.md`:DefineRule/PublishRule 载荷、scope 解析规则、发布不可变语义、热/冷路径承诺。
- `contracts/schemas/rule-commands.schema.json`:命令载荷 Schema(2020-12)。
- `contracts/schemas/rule-result.schema.json`:check_result / 违例项 Schema。
- `tests/contracts/fixtures/rule-commands/{valid,invalid}/*.json` 与 `rule-result/…`:正反例(反例至少:scope 引用不存在类型、未知函数、`when` 语法错、`severity` 越界、发布态再 Define)。
- `scripts/check-contracts.mjs`:登记 `rule-commands`、`rule-result` 两 schema。

**错误码(`packages/shared/contracts/error-codes.yaml` 追加,AG-311 第八类 `RULE-`)**:

| code | http | 含义 |
| --- | --- | --- |
| RULE-422-RULE-VIOLATION | 422 | 热路径 BLOCK 违例(返回命中规则 code/message/severity 清单) |
| RULE-422-SCOPE-UNRESOLVED | 422 | scope 引用未发布/不存在的类型或字段 |
| RULE-400-DSL-SYNTAX-INVALID | 400 | `when` 解析失败(返回位置) |
| RULE-422-EVAL-LIMIT | 422 | 求值超步数/关系上限(降级提示) |
| RULE-409-PUBLISHED-IMMUTABLE | 409 | 对已发布规则版本再 Define |

(注:错误码登记表与 AGENTS.md AG-311 的"类前缀"清单需同步加 `RULE-`,与既有 KERNEL/REVIEW/SIM 一致。)

## 7. 红线对齐(审查清单)

- **AG-105**:规则求值/检查**只读**,不写主数据;`RuleChecker` 实现不得持有写句柄。
- **AG-201**:热路径预检在写入前完成;`BLOCK` 即中止,无事务外副作用、无 outbox。
- **AG-109 / 8.5**:热路径不跑重任务、不全量、不扫他对象。
- **AG-202/203**:`/views/check-results` 有界分页;关系函数有上限。
- **AG-101/102**:check_result 是派生输出,视图零直连、零副本。
- **AG-504**:冷路径 worker 无 `sleep`。
- **AG-301/501**:新命令/错误码经契约 addendum + 人发起。
- **依赖方向**:`RuleChecker` 接口在 `kernel.api`(默认 `NoOpRuleChecker` 于 `kernel.internal`,镜像 `PermissionChecker`);纯求值器在 `engines/rules`;server 提供 `EnginesRuleChecker`(载已发布规则→调 engines/rules→返违例)注入内核握手。**kernel 不依赖 engines**。

## 8. 拆卡建议(逐卡封闭清单、逐卡 `pnpm verify`、串行合并)

| 卡 | 范围(封闭清单要点) | 依赖 |
| --- | --- | --- |
| **3-spec**(人发起) | 契约 addendum:规则命令契约.md + 2 schema + fixtures + check-contracts 登记 + error-codes 追加 `RULE-` + AGENTS AG-311 改"八类" | 无 |
| **3a 求值器** | `engines/rules`:解析器 + AST + 沙箱求值 + 函数白名单;纯,单测含沙箱逃逸/可终止/上限;零 spring/jdbc | 3-spec |
| **3b 规则 M2** | `rule_def` 表(`V9`)+ DefineRule/PublishRule 处理器 + scope 解析校验 + 发布不可变;契约测试 | 3-spec |
| **3c 热路径预检** | `kernel.api.RuleChecker` SPI + NoOp 默认 + `EnginesRuleChecker`(server)+ 接入各改对象命令处理器 + RULE-422-RULE-VIOLATION;集成测试(BLOCK 阻断/ WARN 透传/ 零他对象扫描) | 3a,3b |
| **3d 冷路径** | `check_result` 表(`V10`)+ RunRuleCheck worker(task_queue,无 sleep)+ `/views/check-results` 查询 + 投影;集成测试 | 3a,3b |
| (3e 前端展示) | 违例在表格/详情面板提示 + check-results 面板;纯 views/web | 3c,3d,**后置可选** |

并行性:3a 与 3b 文件集不相交(engines/rules vs kernel rule_def),可并行;3c 依赖二者,3d 依赖二者。建议 **3-spec → (3a‖3b) → 3c → 3d** 串行合并、每步 verify。

## 9. 验收口径(用户视角)

配 2–3 条业务规则(必填/格式/关系闭合),编辑对象时:命中 `BLOCK` 即时被拦并给出规则 message;`WARN` 提示但放行;不卡顿(热路径只跑本类型轻量规则);跑一次全量检查后在 check-results 面板看到全部违例。断开任何外部依赖,平台编辑不受影响。
