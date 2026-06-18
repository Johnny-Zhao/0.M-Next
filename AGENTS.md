# AGENTS.md — AI 编码代理强制约束

本文件对在本仓库工作的 AI 编码代理(Claude/Codex 等)具有**强制约束力**。依据:`/docs/adr`(技术选型 ADR-001~009)、《技术说明书》6.11(模块工程契约)、7.15(标准规范借鉴原则)、8.11(架构红线)、10.7(模块边界)、附录A(术语)、附录D(开发契约)、附录F(标准规范借鉴矩阵)。

每条规则带编号 `AG-xxx` 并标注 CI 检查方式;违反任一规则的 PR 不得合并。合并前必须本地运行 `pnpm verify`(含 `pnpm architecture:check`)。

---

## 0. 已采纳技术决策(只读,变更须走 ADR 流程)

- 后端:Java 21 + Spring Boot 3,模块化单体(ADR-001)
- 前端:TypeScript + React 18 + Vite + pnpm;Tiptap/AntV/ECharts/MapLibre(ADR-002)
- 主存储:PostgreSQL 16;关系网络存于关系表+索引+闭包表,**不引入图数据库**(ADR-003/004)
- 搜索:OpenSearch 2.x;对象存储:MinIO(仅 S3 兼容 API);队列:PG event_outbox + 轮询发布器 + RabbitMQ,Redis 仅缓存/协调(ADR-005/006/007)
- 镜像:linux/amd64 + linux/arm64 双架构;所有端点、Registry、凭证经环境变量配置(ADR-008)
- 标准采用等级:A 直接采用/兼容、B 语义对齐/借鉴、C 参考选型/后续扩展;外部标准不得替代事实源(ADR-009)

## 1. 仓库结构与 package 职责边界

### 1.1 packages 与职责(对应 10.7 模块组)

| Package | 职责(10.7 模块组) | 明确**不得承担**(10.7 原文) |
|---|---|---|
| `packages/shared` | 领域中立的类型、契约 DTO、工具 | 任何业务逻辑、任何 I/O |
| `packages/kernel` | 数据底座组:对象/字段/关系/状态/来源/版本、命令入口、主数据事务、event_outbox | 视图渲染、AI、仿真和深解析 |
| `packages/engines` | 能力引擎:`engines/template`(模板配置组)、`engines/rules`(规则检查组)、`engines/review`(审阅协同组)、`engines/exchange`(输出交换组)、`engines/ai`(AI能力组)、`engines/sim`(仿真与制品组) | 见 AG-105~AG-109 逐项 |
| `packages/views` | 视图引擎组:文档/表格/图形/矩阵等视图插件与插件 SDK、SelectionRef | 复制主数据事实 |
| `packages/server` | 组合根:HTTP 端点、readmodel 投影、worker 进程装配 | 业务规则内联实现 |
| `packages/web` | 工作台壳、选择协调器、前端组合根 | 直连后端内部模块 |

### 1.2 依赖红线(唯一允许的内部依赖)

| Package | 允许依赖 |
|---|---|
| `shared` | 无 |
| `kernel` | `shared` |
| `engines` | `kernel`(仅 `kernel/api` 公共入口)、`shared` |
| `views` | `shared` |
| `server` | `kernel`、`engines`、`shared` |
| `web` | `views`、`shared` |

- AG-100:上表之外的任何跨包 import 均为违规;跨包 import 必须走包的公共入口(public entry point),禁止深路径 import。任何包不得依赖 `server`/`web`(组合根)。CI:`pnpm architecture:check`(dependency-cruiser/ArchUnit)。

### 1.3 import 禁令(由 10.7"不得承担"列推导)

| 编号 | 禁令 | 依据 | CI 检查 |
|---|---|---|---|
| AG-101 | `packages/views/*` 与 `packages/web` **禁止 import** `packages/kernel`、`packages/engines`、`packages/server` 任何模块;后端交互**只能**经 `shared/api-client`(命令端点 + 读模型查询,由 /docs/spec 契约生成) | 10.7"不得复制主数据事实";11.1"视图代码不得 import 内核内部模块" | architecture:check 依赖表;ESLint `no-restricted-imports` |
| AG-102 | `views`/`web` 禁止把对象/字段/关系数据持久化到 localStorage/IndexedDB;仅允许 `ui.` 前缀的界面偏好 | 同上;附录A"视图不是主数据副本" | ESLint 自定义规则:storage key 白名单 |
| AG-103 | `kernel` **禁止依赖**:`engines/*`、`views/*`、任何渲染库、任何解析器(POI/STEP/XMI/ReqIF)、任何 AI SDK、HTTP 出站客户端 | 10.7 数据底座组"不得承担视图渲染、AI、仿真和深解析" | architecture:check:kernel 依赖白名单 = 语言运行时/框架/JDBC/shared |
| AG-104 | `kernel` 内部实现(`kernel/internal/**`:实体、仓储、事务工具)**只能**被 kernel 自身访问;其余包只可 import `kernel/api/**`(命令接口、事件 DTO) | 11.1;D.1 命令入口唯一 | architecture:check 路径规则 |
| AG-105 | `engines/rules` **禁止调用**写命令(`kernel/api/commands`);规则只产出 CheckResult/修复建议;自动修复必须生成变更集走确认流 | 10.7"规则检查组不得直接修改高风险正式数据" | architecture:check:rules → kernel/api/commands 禁止 |
| AG-106 | `engines/ai` 对主数据唯一写入路径为 `SubmitAIChangeSet`/`ConfirmAIChangeSet`;**禁止**引用其他写命令(CreateObject/UpdateFields/CreateRelation/…) | 10.7"AI能力组不得绕过规则和确认写入" | architecture:check:ai 包对 commands 的 import 白名单仅含上述两项 |
| AG-107 | `engines/sim` 与 worker 装配产物**禁止打入主业务服务部署单元**;主服务装配清单禁止声明对 sim 的依赖 | 10.7"仿真组不得占用主业务服务计算资源";8.11 | CI:主服务镜像内容清单比对 + 构建期 banned-dependencies |
| AG-108 | 制品解析器(`engines/exchange/adapters/**`)**禁止被** kernel、readmodel、上传端点 import;深解析只能由 worker 经 task_queue 触发 | 10.7"输出交换组不得将解析逻辑压入数据内核";8.8 三级解析 | architecture:check + 上传链路依赖扫描 |
| AG-109 | `engines/template` 禁止注册任何 `TaskHandler`(运行期重任务) | 10.7"模板配置组不得承担运行期重任务" | architecture:check:template 禁止实现 TaskHandler |
| AG-110 | 所有主数据写操作必须经命令入口 `POST /workspaces/{id}/commands`;**禁止**任何代码(kernel/internal/persistence 除外)对 object/field_value/relation 等主数据表直接 INSERT/UPDATE/DELETE | D.1 第一句 | architecture:check(写 API 仅限 kernel/internal/persistence)+ SQL lint |

## 2. 架构红线清单(8.11 逐条 → 可执行编码禁令)

| 编号 | 禁令 | 8.11 原文依据 | CI 检查 |
|---|---|---|---|
| AG-201 | 命令处理器(kernel/api/commands 实现)事务内**只允许**:权限/规则预检、主数据+版本+event_outbox 写入;**禁止调用** AI、全量检查、输出渲染、深解析、仿真、资产入库、任何 HTTP 出站 | "主编辑链路不得同步执行AI、全量检查、输出生成、深解析、仿真或资产入库" | architecture:check 依赖白名单;命令单测断言事务内零出站调用 |
| AG-202 | 任何视图代码**禁止在编辑/输入事件处理器中发起全量查询**:api-client 查询必须带 workspaceId + 分页(pageSize≤200)或显式范围;标记 `@FullScan` 的接口禁止在 views/web 出现 | "视图不得每次全量扫描主数据" | ESLint 自定义规则(事件处理器作用域内的 api-client 调用必须含 page/scope 实参);api-client 生成器对全量接口打标 |
| AG-203 | 关系查询必须显式 `relationType` + `direction` + `depth≤5` + `workspaceId`;**禁止**默认全图遍历;relation 表查询必须命中 (workspace_id, source_id/target_id, relation_type) 索引 | "关系查询必须有索引、方向与范围控制";D.2"禁止默认全图扫描" | API Schema 必填参数校验;关键查询 EXPLAIN 断言测试(禁止 Seq Scan);性能基准门禁 |
| AG-204 | `source=AI` 的主数据事件,其 `causationId` 必须指向 ConfirmAIChangeSet 命令;其余路径产生 source=AI 事件即违规 | "AI不得绕过确认修改高风险正式数据" | 契约测试断言事件因果链 |
| AG-205 | 仿真执行代码禁止出现在主业务服务部署单元;仿真任务必须经 task_queue 派发到 sim 进程 | "仿真不得运行在主业务服务中" | 同 AG-107 |
| AG-206 | 上传/登记端点**禁止调用深解析**;链路只允许:登记(名称/大小/格式/hash)→ 元数据解析任务入队;深解析仅由 `POST /artifacts/{id}:parse` 显式触发 | "制品不得默认深解析" | 上传链路依赖扫描;E2E 断言上传后 parse_level=registered |
| AG-207 | 所有冷路径任务必须实现 `TaskHandler` 契约:taskType 注册、取消令牌检查点、retryPolicy、`cacheKey()`(文件hash+解析器版本+配置)、进度上报;**禁止**绕过 task_queue 自起线程/定时器跑重任务 | "所有重任务必须可排队、可取消、可重试、可缓存、可追踪" | architecture:check(worker 外禁止裸线程池);TaskHandler 契约测试 |
| AG-208 | 输出渲染器入参**只能是 snapshotId**;禁止接受 workspaceId 直读实时数据生成输出 | "输出必须形成快照" | 接口签名(类型层面)+ 契约测试 |
| AG-209 | SelectionRef/选择联动处理代码**禁止**:调用命令端点、写数据库、产生版本、发起全工作空间查询、触发全图重绘;同一实体表达位置 >100 时只高亮可见范围 | 8.4.1(8.11 的视图侧细化) | ESLint:selection 回调作用域禁止 import api-client 命令模块;E2E 断言选择操作零写请求 |
| AG-210 | 温路径事件消费者(readmodel/搜索/规则增量/审计/通知)必须经框架幂等注册(event_id 去重);禁止假设恰好一次投递 | ADR-007;D.1 事件信封 | 消费者必须以 `@IdempotentConsumer` 注册,未注册的订阅 CI fail |
| AG-211 | 重型约束求解、全量模型转换、分布式联合仿真和大规模语义推理**禁止进入命令事务与热路径**;只能由实现 `TaskHandler` 契约的温/冷路径任务执行 | F.5"不得阻塞热路径编辑事务" | architecture:check 重型模块依赖扫描;TaskHandler 契约测试;命令事务零重型调用测试 |

## 3. 代码规范

### 3.1 命名:中文术语 → 英文标识符(依据附录A,禁止自造同义词)

| 中文术语 | 标识符 | 禁用同义词 |
|---|---|---|
| 统一数据源 | `UnifiedDataSource` | DataHub、DataLake |
| 对象 | `DataObject` | Entity、Item、Node |
| 字段/属性 | `Field` / `Attribute` | Prop、Column |
| 关系 | `DataRelation` | Edge、Link、Association |
| 视图 | `View` | Page、Screen |
| 工作空间 | `Workspace` | Project、Tenant |
| 场景模板 | `SceneTemplate` | Scenario、Blueprint |
| 数据审阅与评价 | `DataReview`(单条批注 `Annotation`) | Comment |
| 成果输出与制品交换 | `ArtifactExchange` | Export、FileSync |
| 特性驱动复用 | `FeatureDrivenReuse` | — |
| AI 变更集 | `AIChangeSet` | AIPatch、Suggestion |
| 制品适配器 | `ArtifactAdapter` | Converter、Importer |
| 仿真调度器 | `SimulationScheduler` | SimRunner |
| 多视图选择联动 | `SelectionLinkage`,载荷 `SelectionRef` | Highlight、Focus |
| 元模型 | `MetaModel` | Metamodel、MetaSchema |
| 领域特定语言 | `DomainSpecificModelingLanguage` / `DSML` | DSLModel |
| 模型解释器 | `ModelInterpreter` | ModelRunner |
| 模型转换 | `ModelTransformation` | ModelConvert |
| 约束求解器 | `ConstraintSolver` | Optimizer |
| 标准适配器 | `StandardAdapter` | StandardImporter、StandardConverter |

- AG-301:命令与事件名**只能**取自 /docs/spec 附录D 已注册集合(命令:CreateObject、UpdateFields、ChangeState、CreateRelation、UpdateRelation、Archive、Unlink、SoftDelete、BatchCommand、SubmitAIChangeSet、ConfirmAIChangeSet;事件:ObjectCreated、FieldChanged、StateChanged、RelationCreated、RelationUpdated、RelationUnlinked、Archived、SoftDeleted、BatchCommitted、AIChangeSetConfirmed、CheckResultUpdated)。**v1.1 addendum 注册集**:M2 授权命令(DefineObjectType/DefineFieldDef/DefineRelationType,见 contracts/元模型命令契约.md)、评审命令(CreateAnnotation/ResolveAnnotation/ReopenAnnotation,见 contracts/评审命令契约.md),经独立 meta-commands/review-commands 端点,不混入 M1 `/commands`。新增须先修订契约(见 AG-501)。CI:契约 Schema 校验,未注册 eventType/commandType 直接 fail。
- AG-302:数据库 snake_case;Java 类 PascalCase;TS 文件 kebab-case;事件名 PascalCase 过去式。CI:checkstyle + ESLint naming。

### 3.2 错误码(依据 D.2)

- AG-311:错误码格式 `前缀-HTTP状态-原因`,前缀**仅允许**十类:`KERNEL-`(内核/版本/事务/幂等)、`RULE-`(规则失败/阻断)、`PERM-`(权限/越界)、`AI-`(变更集/确认流程)、`ARTIFACT-`(解析/映射/同步)、`REVIEW-`(评审批注/状态,见 contracts/评审命令契约.md)、`SIM-`(仿真运行/事件,见 contracts/仿真事件契约.md)、`META-`(元模型泛化/重定义/值类型,见 contracts/元模型命令契约.md)、`DERIVE-`(派生属性计算,见 contracts/元模型命令契约.md)、`M2M-`(跨 profile 转换/联邦,见 contracts/元模型命令契约.md)。示例:`KERNEL-409-VERSION-CONFLICT`、`PERM-403-FIELD-DENIED`、`AI-409-CHANGESET-EXPIRED`、`SIM-422-ENGINE-NOT-FOUND`、`META-422-GENERALIZATION-CYCLE`、`DERIVE-409-DEPENDENCY-CYCLE`、`M2M-422-SOURCE-UNRESOLVED`。所有码登记于 `packages/shared/contracts/error-codes.yaml`,CI 校验代码中出现的码均已登记。
- AG-312:错误响应必须含用户可理解 message 与建议操作(D.2 返回要求);禁止向前端透出裸异常堆栈。CI:错误响应契约测试。

### 3.3 日志与审计

- AG-321:所有主数据写操作必须填 `created_by`/`updated_by`(取自认证上下文)与时间戳;**禁止**留空、写死系统账号、或接受客户端传入(9.6.2)。CI:迁移脚本 lint 校验 NOT NULL;内核命令单测断言审计字段。
- AG-322:事件必须携带完整信封:eventId、eventType、workspaceId、targetType/targetId、version、before/after、actor、source(仅允许枚举 manual/rule/AI/artifact_sync/simulation/system)、occurredAt、correlationId、causationId(D.1)。CI:事件 Schema 校验。
- AG-323:服务日志必须经 MDC 注入 correlationId 与 workspaceId;禁止打印口令、token、密钥。CI:日志格式单测 + secret 扫描。
- AG-324:audit_log 仅追加;任何代码路径**禁止** UPDATE/DELETE audit_log(第4章)。CI:SQL lint;应用数据库账号不授予该表 UPDATE/DELETE 权限。

## 4. 提交规范

- AG-401:**一个任务一个分支**,命名 `feat|fix|chore/<task-id>-<slug>`(例 `feat/T-1024-relation-closure-table`);禁止一分支混多任务。CI:分支名正则 + PR 关联唯一 task-id。
- AG-402:PR 描述**必须**含 `Spec-Ref:` 行,引用 /docs/spec 契约条款编号(例 `Spec-Ref: D.1-CreateRelation, 8.11-红线2, 6.11-数据内核`);涉及选型须引用 ADR 编号。CI:PR 模板字段非空 + 编号存在于 spec 索引。
- AG-403:Conventional Commits;一 commit 一逻辑变更。CI:commitlint。
- AG-404:合并前置(全部必过):format、lint、类型检查、内核命令单测(核心命令覆盖率≥80%,含异常路径/权限前置/幂等键,11.1)、契约测试、`pnpm architecture:check`、构建、双架构镜像构建、性能基准无回退(P95 超阈值阻断或登记例外)。CI:必选 stage,顺序如上。
- AG-405:**代理写入纪律**(T-V33-001 截断事故根因 P-T01 固化):禁止对 >50 行的既有文件做整文件重写,修改一律最小补丁;新增长内容分段追加(每段 ≤40 行);每个文件写完立即核验——文本跑 `wc -l` 与 `tail -3`,JSON/YAML 跑解析校验——并将核验输出贴入 PR。CI:PR 模板"写后自检输出"段必填,缺失即拒。
- AG-406:**契约夹具必须随契约入库**(fed-1 夹具漏提交事故固化):凡契约 addendum(`contracts/**`、`packages/shared/contracts/**`)新增或改动,其配套 `tests/contracts/fixtures/**`(valid/invalid)与 `tests/contracts/**` 用例**必须**列入该卡封闭清单并 `git add` 同提交;严禁夹具只落本地磁盘而不入 git(否则本地 verify 假绿、全新 clone/CI 无夹具可校)。完成时 `git status` 必须 clean(无 Untracked 的 fixtures)。CI:`scripts/check-contracts.mjs` 在干净 checkout 上运行,缺夹具即 fail;PR 校验 `git status --porcelain` 为空。

## 5. 禁止事项

- AG-501:**禁止修改 `/docs/spec/` 下任何文件。** 契约变更由人发起独立 spec-change PR;AI 代理只能在 PR 描述中提建议。CI:CODEOWNERS + 路径保护,代理提交触碰该路径直接 fail。

- AG-502:**禁止引入未在 ADR 中批准的依赖。** 运行时依赖以 `/ci/deps-allowlist.yaml`(由 ADR-001~009 派生)为准;新增依赖先提 ADR 变更。同时执行 ADR-008 准入门禁:含 native 产物的依赖必须有 linux-arm64 构件;全部依赖可从内网私服解析;license 仅限 MIT/Apache-2.0/BSD/ISC/EPL。CI:lockfile/pom 与 allowlist 比对 + arm64 探测 + license 扫描 + 断网构建流水线。

- AG-503:**禁止绕过权限检查。** 命令处理必须先调用 PermissionChecker 预检(D.1 前置条件);禁止新增 `skipPermission`/`internalOnly` 类旁路参数;所有查询端点(含搜索)强制 workspace 范围过滤。CI:architecture:check(命令处理器必经 PermissionChecker)+ 越权测试套件必跑(9.5)。

- AG-504:**测试禁止用 sleep 等待异步结果。** 等待 outbox 投递/任务完成只允许:测试内同步 drain 的 TestOutboxRelay、Awaitility/带超时轮询断言、任务状态查询。CI:静态扫描测试代码中的 `Thread.sleep`/裸 `setTimeout` 等待;豁免须注释 `// AG-504-exempt: <理由>` 并人工评审。

- AG-505:**禁止硬编码公网 URL**(AI 端点、镜像源、CDN、遥测);AI 端点只能读 `AI_GATEWAY_URL` 等环境变量;镜像引用一律 `${REGISTRY_PREFIX}/...`(9.6.2;ADR-008)。CI:代码与镜像外呼扫描 + compose/Helm lint。

- AG-506:**禁止直连基础设施。** PostgreSQL/OpenSearch/MinIO/RabbitMQ 的驱动与 SDK 只允许出现在对应封装层(kernel/internal/persistence、SearchGateway、StorageClient、OutboxRelay/TaskDispatcher);其他模块一律经封装接口。CI:依赖扫描(驱动依赖声明位置白名单)。

- AG-507:**禁止把外部标准文件(ReqIF/XMI/STEP/FMU 等)作为事实源直读直写**;导入必须解析为内部对象/字段/关系/制品映射,输出由适配器生成(依据 F.5/7.15.3)。CI:适配器代码扫描"绕过内核命令直接以标准文件为读写目标"模式。

- AG-508:**C 级标准/工具(以 ADR-009 §C 级清单为准)禁止进入 MVP 依赖与主流程**;引入前必须新增专项 ADR 并通过 ADR-008 准入。A 级标准适配器必须声明支持子集并维护 golden files,适配器变更必须跑样本回归(F.4-1/3/4)。CI:deps-allowlist 与 C 级清单比对;适配器目录存在 golden/ 样本集检查。

---

## 附:提交前自检清单(代理每次提交前逐条核对)

1. 本次变更落在哪个 package?该 package"不得承担"什么(§1.1/§1.3)?

2. 是否在热路径/事件处理器中加入了重操作或全量查询(AG-201/202/209/211)?

3. 写操作是否走命令入口、审计字段是否必填、事件是否在注册集合内(AG-110/301/321/322)?

4. 新依赖是否在 allowlist、命名是否在附录A 对照表 20 项内(AG-502/§3.1)?

5. 分支命名、Spec-Ref、测试等待方式是否合规(AG-401/402/504)?

6. `pnpm verify` 是否全绿?
