# T-V33-WPM — WPM 加权积决策方法引擎(第 4 个方法)

蓝本:`docs/比选决策引擎-框架设计稿.md` §1-2 + TOPSIS/AHP 卡的跟进"加权积 等更多方法同模式可加"。前置在 main(v1.42,含 `decision-topsis`/`decision-ahp` 引擎与 SimulationEngine SPI)。**纯 engines 单测、不要 Docker**,可与任何 Docker e2e 并行。**照抄 AHP 引擎的候选归一打分,把"加权和"换成"加权积"。**

定位:第 4 个通用、领域无关的决策方法引擎(自带 A 类自研轻量),作为新 `SimulationEngine` 实现挂现有 SPI——复用 RunSimulation/SimConfig/SimResult,**零命令、零契约、零迁移**。WPM(Weighted Product Model)用连乘代替加权和,对量纲差异更稳健,与 TOPSIS/AHP 互补,进一步证明"方法可插拔"。

## 范围

新增 `WpmDecisionEngine`(engineId=`decision-wpm`),实现 `SimulationEngine.run(DataSet, SimConfig) → SimResult`。

### 配置(`SimConfig.parameters`,领域可变)
- `candidateTypeCode`:候选对象类型 code;
- `criteria`:`[{field, weight, direction}]`——`field`=候选数值字段 code,`weight≥0`,`direction`=`benefit`/`cost`。

### 算法(确定式、可手算)
1. 读快照取 `candidateTypeCode` 候选 + criteria 字段值(缺字段→`SIM-422-`)。
2. **列归一**(与 AHP 候选归一同口径):benefit `r = x/Σx`(列和;全 0 列→该列归一为 0);cost `r = (1/x)/Σ(1/x)`(任一 `x≤0` → `SIM-422-` cost 列须正)。
3. **加权积打分**:`score_i = Π_j (r_ij)^(w_j)`(连乘;`Math.pow`)。约定:某 benefit 列归一为 0 导致该候选 `score=0`(WPM 本性,缺一项即出局)——保留、不特判。
4. 按 `score` 降序排名,tiebreak 用候选源序(sourceIndex 升序),与 TOPSIS/AHP 一致。

### 输出(`SimResult.values`)
- `engineId`;`ranking`:`[{candidateId, score, rank}]`(rank 从 1);`bestCandidateId`。

### 有界(AG-202/203)
- 候选数 ≤ `MAX_CANDIDATES=1000`、指标数 ≤ `MAX_CRITERIA=64`;`weight<0` 抛错;权重和无需=1。

### 纯函数
无 I/O、无副作用、不读库(只吃 DataSet 快照);复用现有编排落 simulation_run(本卡不碰编排)。

## 封闭文件清单

**新增**
- `packages/engines/src/main/java/com/mnext/engines/sim/WpmDecisionEngine.java`
- `packages/engines/src/test/java/com/mnext/engines/sim/WpmDecisionEngineTest.java`(纯单测)

**修改**
- `packages/engines/src/main/resources/META-INF/services/com.mnext.engines.sim.SimulationEngine`(**追加一行** `com.mnext.engines.sim.WpmDecisionEngine`;不动现有 echo/energy-soc/decision-topsis/decision-ahp 行)

**零碰**:kernel、server、views、contracts、迁移、RunSimulation 编排、SPI 签名、SimConfig/SimResult、其它引擎文件。

## 红线 / 门禁
- 纯数值/确定式,无 I/O、无副作用、不读库;不改 SPI/SimConfig/SimResult/编排;**不引新依赖**(纯 JDK,`Math.pow`)。
- 错误一律 `IllegalArgumentException`,前缀 `SIM-422-`(AG-311,与 TOPSIS/AHP 一致)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;engines 纯单测,**确认 engines 汇总 `Tests run: N, …, Skipped:0`**(+ `node scripts/check-no-skipped.mjs`)。
- AG-405 落盘自检;**分支 `feat/T-V33-wpm` 上 commit 但不要合并**;基线落后只 `git merge main` 拉平,别手动增删别的文件;完成发 `git diff --stat main`(**应仅三文件**)+ engines 测试汇总行。
- 若需新依赖/改 SPI/暴露 SimConfig-SimResult 之外能力——**停下回报,不夹带**。

## 验收(单测覆盖)
1. **手算**:3 候选 × 2 指标(price[cost]、quality[benefit],权重如 0.5/0.5),手算列归一 + 连乘得分与排名,断言 `ranking`/`score`(小数容差)/`bestCandidateId` 一致。
2. 边界:缺候选/缺字段抛错;cost 列含非正抛错;候选/指标超限抛错;`weight<0` 抛错。
3. 退化:某 benefit 列全 0 → 相关候选 score=0、不崩;tiebreak 源序确定;某 benefit 列全相等不崩。
4. `SimEngineRegistry().require("decision-wpm").engineId()` == `decision-wpm`(ServiceLoader 注册)。

## 跟进(本卡不做)
- 推荐端点接入 `method=wpm`(同 REC-C 模式,读最近 `decision-wpm` run 的 ranking·分值键 `score`)——另卡 REC-D。
- 可选 doc:`contracts/仿真事件契约.md` 登记 `decision-wpm` 的 config/result 键。
