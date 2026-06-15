# 任务卡 T-V33-SIM-SPI — 仿真能力引擎 SPI(L0,可执行语义底座)

- 状态:**待 spec-change**(契约 addendum 须先合 main)——`contracts/仿真事件契约.md` + `simulation-events.schema.json` 已产出;待人提交 fixtures + check-contracts 校验 + error-codes(SIM-)+ AGENTS AG-311 修订后开工(AG-501)
- 分支:`feat/T-V33-SIM-SPI-l0`(从**含 addendum 的** main 切出,AG-401)
- PR 要求:`Spec-Ref: 仿真事件契约(addendum)-SimulationCompleted, 说明书 §7/§193/§1134, docs/13 §1, AGENTS.md AG-208/AG-201/AG-311/AG-504` + AG-405 自检输出段
- 依据:`docs/13-sysml-executable-semantics.md` §1;`contracts/仿真事件契约.md`;承 704 快照、707/708 SPI 样板
- 对应:L0 —— 所有执行引擎(fUML/PSSM/Modelica/FMU)的统一插座;本卡用内置 stub 引擎验通管线,**不引外部重引擎**(L2)

## 人工前置(spec-change,缺一不可开工)

提交进 main:① `contracts/仿真事件契约.md`(已产出);② `contracts/schemas/simulation-events.schema.json`(已产出);③ fixtures `tests/contracts/fixtures/simulation/`(正/反例各 ≥3);④ `scripts/check-contracts.mjs` 增校验该 schema + fixtures;⑤ `error-codes.yaml` 登记 SIM-404/422/409/500;⑥ AGENTS.md AG-311 前缀集加 `SIM-`。Codex 不得自建/自改契约。

## 目标

落地**仿真能力引擎 SPI + 异步运行 + 结果存储 + 状态机**:`POST /simulations {snapshotId, engineId, config}` → 建 QUEUED run → 异步执行(载 704 快照 → `SimulationEngine.run` → 存结果 + 哈希 → COMPLETED/FAILED)→ 可查 run 状态/结果。**输入只接 snapshotId(AG-208);执行异步、不进命令热路径(§1134);内置 `EchoSimulationEngine` 验管线;不引外部引擎、无 AI/重库。** `SimulationCompleted` 本期落 run 表(到达 COMPLETED 即是),**总线发布留后续**。

## 涉及文件(封闭清单)

- **新增** `V8__simulation_run.sql`(server 迁移):`simulation_run`(run_id PK、workspace_id、snapshot_id、engine_id、status、config JSONB、result JSONB NULL、result_hash CHAR(64) NULL、config_hash CHAR(64)、queued_at、started_at NULL、completed_at NULL、created_by、failure_reason NULL)+ ws/status 索引。**不改 V1–V7。**
- **新增** `packages/engines/src/main/java/com/mnext/engines/sim/`:`SimulationEngine` SPI(engineId、run(DataSet snapshot, SimConfig):SimResult)、`SimConfig`/`SimResult`(record)、`EchoSimulationEngine`(纯:把快照对象/关系计数等摘要回显为确定性结果)、`SimEngineRegistry`(ServiceLoader,未知 engineId → SIM-422)。
- **新增** `META-INF/services/com.mnext.engines.sim.SimulationEngine`:登记 EchoSimulationEngine。
- **新增** `packages/server/.../SimulationController.java`:`POST /workspaces/{id}/simulations`、`GET .../simulations`、`GET .../simulations/{runId}`。
- **新增** `packages/server/.../SimulationRunRepository.java`:建 run(校验快照存在→否则 SIM-404、引擎注册→否则 SIM-422)、状态机迁移(非法→SIM-409)、读 704 快照(复用 SnapshotRepository)、存结果 + SHA-256(result_hash / config_hash)。
- **新增** `packages/server/.../SimulationRunner.java`:异步驱动 QUEUED→RUNNING→执行引擎→COMPLETED;引擎抛错→FAILED + failureReason(SIM-500)。**提供可被测试同步触发的 drain 方法**(仿 OutboxRelay/E2E projectOutbox,避免 sleep,AG-504)。
- **新增** server DTO + 测试(engines `SimEngineTest`、server `SimulationIntegrationTest`)。**禁止新增依赖(AG-502)。**

## 行为要求(逐条可测)

1. **AG-208**:`POST /simulations` 只接 snapshotId;缺 snapshotId / 传 workspaceId 直跑 → 拒(400)。
2. **校验**:快照不存在 → `SIM-404`;engineId 未注册 → `SIM-422`。
3. **异步运行**:run 建为 QUEUED → runner 置 RUNNING → 载快照 DataSet → `engine.run` → 存 result + result_hash(SHA-256)+ config_hash → COMPLETED;引擎抛 → FAILED + failureReason(`SIM-500`)。
4. **状态机**:非法迁移 → `SIM-409`;不可变历史(完成态不再改)。
5. **EchoSimulationEngine**:纯、确定性(同快照 + 同配置 → 同 result_hash)。
6. **隔离/纯**:engines/sim 无 Spring/JDBC/SQL/命令(架构断言);仿真只读消费快照、**不写主数据、不发内核命令**;run 表为派生输出域(类比 704 快照、708 输出)。
7. **无 sleep**:测试经 runner 的同步 drain 触发执行,不用 Thread.sleep。

## 测试要求(jacoco ≥0.80;AG-504 禁 sleep)

engines `SimEngineTest`:EchoEngine 同输入同 hash;SimEngineRegistry 取到 echo + 一个测试引擎、未知 engineId 抛 SIM-422;架构断言 engines/sim 无 spring/jdbc/sql/命令。server `SimulationIntegrationTest`(Testcontainers):enqueue→drain→COMPLETED、结果可取、result_hash 稳定;快照不存在→SIM-404;未知引擎→SIM-422;传 workspaceId/缺 snapshotId→400;非法状态迁移→SIM-409。

## 验收标准(机器可判)

1. `pnpm verify` 全绿(贴 jacoco;Skipped:0 需 Docker)+ `pnpm contracts:check` 通过(含 simulation-events schema + fixtures);2. `pnpm architecture:check` 通过;3. 演示链:捕快照 → `POST /simulations {snapshotId, engineId:echo}` → drain → `GET /simulations/{id}` 得 COMPLETED + 结果 + result_hash;再跑同输入 → 同 hash;4. `git diff --stat main` 限封闭清单(V1–V7 与既有零改);5. PR 含 AG-405 自检。

## 禁止事项

禁止实现:外部 fUML/PSSM/Modelica 引擎(L2/L3,需许可 ADR)、SimulationCompleted 入 Outbox/RabbitMQ 总线 + 投影(后续)、SysML 数据映射(L1 另卡)、AI、对象存储大结果、引入任何新依赖。禁止触碰:`packages/{kernel,shared}/**`、主数据写路径、V1–V7 迁移、contracts/schemas 中既有文件(仅新增 simulation schema 经 spec-change)、AGENTS(除 spec-change 的 AG-311)、packages/{views,web};SnapshotRepository 只复用不改。仿真只读快照、不写主数据、不发内核命令;输入只接 snapshotId(AG-208)。

## 给 Codex 的落盘自检(防截断)

每个新增 `.java`/`.sql`/`.json` 落盘后:大括号/语法完整、文件完整闭合;spotless:apply 与 check-contracts 不报错;编译过再跑测试。禁止提交语法不完整文件。每步一 commit,完成后停止等待审查。
