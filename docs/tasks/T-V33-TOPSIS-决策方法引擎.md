# T-V33-TOPSIS — TOPSIS 决策方法引擎(可插拔方法层)

蓝本:`docs/比选决策引擎-框架设计稿.md` §1-2(方法引擎层:加权和内置、标准 MCDA 自研轻量)。前置在 main(v1.35)。**与 BID 零文件冲突**(engines vs server 测试)、**纯 engines 单测、不要 Docker**(可与 Docker e2e 并行)。

定位:**通用、领域无关的决策方法引擎**(自带能力,A 类自研轻量),作为一个新的 `SimulationEngine` 实现插入现有 SPI——复用 RunSimulation/SimConfig/SimResult 框架,**零命令、零契约、零迁移**。各行业的指标/权重/方向是**配置**(经 SimConfig 传入),引擎本身不含领域知识。证明比选框架"方法可插拔"。

## 范围

新增 `TopsisDecisionEngine`(engineId=`decision-topsis`),实现 `SimulationEngine.run(DataSet snapshot, SimConfig config) → SimResult`:

- **配置**(`SimConfig.parameters`,领域可变):
  - `candidateTypeCode`:候选对象类型 code(读快照里这些对象);
  - `criteria`:`[{field, weight, direction}]`——`field`=候选上的数值字段 code,`weight`≥0,`direction`=`benefit`(越大越优)/`cost`(越小越优)。
- **读快照**(只读,AG-105):取 `candidateTypeCode` 的候选对象 + 其 criteria 字段值(缺字段→`SIM-422-` 抛错)。
- **TOPSIS 算法**(确定式,可手算):
  1. 决策矩阵(候选×指标);
  2. 向量归一 `r_ij = x_ij / sqrt(Σ_i x_ij²)`(列归一;某列全 0 则该列归一为 0);
  3. 加权 `v_ij = w_j · r_ij`;
  4. 理想解 `A+`(benefit 取列 max、cost 取列 min)、负理想 `A-`(反之);
  5. 距离 `S+_i = sqrt(Σ_j (v_ij - A+_j)²)`、`S-_i` 同理;
  6. 贴近度 `C_i = S-_i / (S+_i + S-_i)`(分母 0 时 C_i=0);
  7. 按 `C_i` 降序排名。
- **输出** `SimResult.values`:`engineId`、`ranking`(`[{candidateId, closeness, rank}]`,rank 从 1)、`bestCandidateId`。
- **有界**(AG-202/203):候选数 ≤ `MAX_CANDIDATES=1000`、指标数 ≤ `MAX_CRITERIA=64`,超限抛 `IllegalArgumentException`(`SIM-422-` 前缀);权重和无需=1(算法不要求,但 weight<0 抛错)。
- **纯函数**:无 I/O、无副作用、不读库;复用现有 RunSimulation 编排落 simulation_run(本卡不碰编排)。

## 封闭文件清单

**新增**
- `packages/engines/src/main/java/com/mnext/engines/sim/TopsisDecisionEngine.java`
- `packages/engines/src/test/java/com/mnext/engines/sim/TopsisDecisionEngineTest.java`(纯单测)

**修改**
- `packages/engines/src/main/resources/META-INF/services/com.mnext.engines.sim.SimulationEngine`(加一行 `com.mnext.engines.sim.TopsisDecisionEngine`)

**零碰**:kernel、server、views、contracts、迁移、RunSimulation 编排、SimulationEngine SPI 签名、SimConfig/SimResult。

## 红线 / 门禁

- 纯数值/确定式,无 I/O、无副作用、不读库(只吃传入 DataSet 快照)。
- 不改 SPI 签名/SimConfig/SimResult/编排;不引新依赖。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;engines 纯单测,**确认 engines 汇总 Skipped:0**(+ `node scripts/check-no-skipped.mjs`)。
- AG-405 落盘自检;完成发 `git diff --stat main`(应仅三文件)+ engines 测试汇总。

## 验收(单测覆盖)
- 给一个小快照(3 候选 × 2 指标:price[cost]、quality[benefit];权重如 0.5/0.5)+ config,**手算 TOPSIS 贴近度与排名**,断言 `ranking`、`closeness`(允许小数容差)、`bestCandidateId` 与手算一致;
- 边界:缺候选/缺字段抛错;候选/指标超限抛错;weight<0 抛错;
- 退化:某指标列全相等/全 0 不崩(归一/分母保护)。

## 跟进(本卡不做)
- 方法引擎与 BID:BID 用"加权和"(派生内置),本卡提供 TOPSIS 备选——证明"方法可插拔";后续可在比选只读查询里按比选模型的"方法选择"调不同 engineId。
- 可选 doc:`contracts/仿真事件契约.md` 登记 `decision-topsis` 的 config/result 键(引擎目录文档化,非门禁)。
- AHP / 加权积 等更多方法同模式可加。
