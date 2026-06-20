# T-V33-AHP — AHP 决策方法引擎(可插拔方法层·第二个 A 类方法)

蓝本:`docs/比选决策引擎-框架设计稿.md` §1-2(方法引擎层:标准 MCDA 自研轻量 A 类)。前置在 main(v1.38,含 TOPSIS=`decision-topsis`、SimulationEngine SPI/RunSimulation 编排)。**与一切 server/contracts/迁移零冲突**(纯 engines)、**纯 engines 单测、不要 Docker**(可与任何 Docker e2e 并行)。

定位:**通用、领域无关的第二个决策方法引擎**(自带能力,A 类自研轻量),作为新的 `SimulationEngine` 实现插入现有 SPI——复用 RunSimulation/SimConfig/SimResult 框架,**零命令、零契约、零迁移**。兑现 TOPSIS 卡的跟进"AHP / 加权积 等更多方法同模式可加",把"方法可插拔"从一个证明变成真有两个可选方法(加权和 / TOPSIS / AHP)。各行业的指标、两两比较是**配置**(经 SimConfig 传入),引擎本身不含领域知识。

## 范围

新增 `AhpDecisionEngine`(engineId=`decision-ahp`),实现 `SimulationEngine.run(DataSet snapshot, SimConfig config) → SimResult`。

### 配置(`SimConfig.parameters`,领域可变)
- `candidateTypeCode`:候选对象类型 code(读快照里这些对象);
- `criteria`:`[{field, direction}]` 有序数组——`field`=候选上的数值字段 code,`direction`=`benefit`(越大越优)/`cost`(越小越优);**顺序即两两比较矩阵的行列顺序**;数量 = n。
- `comparisonMatrix`:`n×n` 数组,Saaty 正互反矩阵——`m[i][j]` = 指标 i 相对指标 j 的重要度;要求**对角线=1**、**正数**、**互反** `m[j][i] ≈ 1/m[i][j]`(容差校验);n 与 `criteria` 长度一致。
- 可选 `consistencyThreshold`:CR 阈值,默认 `0.10`。

### 算法(确定式、可手算 —— 用几何均值法,不需特征值求解器)
1. **校验矩阵**:方阵、阶 = n = criteria 数;每元正有限;对角线=1(容差);互反 `|m[i][j]·m[j][i] − 1| ≤ 1e-6`(容差);否则 `SIM-422-` 抛错。
2. **求权重(行几何均值归一)**:`g_i = (Π_j m[i][j])^(1/n)`;`w_i = g_i / Σ_k g_k`。权重和=1。
3. **一致性**:
   - 加权和向量 `(Aw)_i = Σ_j m[i][j]·w_j`;
   - `λ_i = (Aw)_i / w_i`,`λ_max = mean(λ_i)`;
   - `CI = (λ_max − n) / (n − 1)`(n=1 或 2 → CI=0、CR=0,RI=0);
   - `RI(n)`:查表(Saaty):n=1→0,2→0,3→0.58,4→0.90,5→1.12,6→1.24,7→1.32,8→1.41,9→1.45,10→1.49(n>10 → `SIM-422-`,见有界);
   - `CR = RI=0 ? 0 : CI / RI`;`consistent = CR ≤ consistencyThreshold`。
   - **CR 超阈不抛错**——照常算分,只在结果里标 `consistencyRatio` + `consistent=false`(把判断权交给上层/UI;硬失败会让"看一致性"这事做不了)。
4. **候选打分**(对候选字段做与权重一致的归一,再加权):
   - 决策矩阵(候选×指标),缺字段→`SIM-422-`;
   - 列归一:benefit `r = x/Σx`(列和;某列全 0 → 该列归一为 0);cost 用 `r = (1/x)/Σ(1/x)`(任一 `x≤0` → `SIM-422-`,cost 列须正);
   - 候选得分 `score_c = Σ_j w_j · r_cj`;
5. 按 `score` 降序排名,tiebreak 用候选在快照里的源序(sourceIndex 升序),与 TOPSIS 一致。

### 输出(`SimResult.values`)
- `engineId`;
- `criteriaWeights`:`[{field, weight}]`(与 criteria 同序);
- `consistencyRatio`(double)、`consistent`(boolean)、`lambdaMax`(double);
- `ranking`:`[{candidateId, score, rank}]`,rank 从 1;
- `bestCandidateId`。

### 有界(AG-202/203)
- 候选数 ≤ `MAX_CANDIDATES=1000`、指标数 `2 ≤ n ≤ MAX_CRITERIA=10`(AHP 矩阵 RI 表只到 10,且 n>10 人难给一致矩阵——超限 `SIM-422-` 抛错);
- 矩阵非方阵 / 阶与 criteria 不符 → 抛错。

### 纯函数
无 I/O、无副作用、不读库(只吃传入 `DataSet` 快照);复用现有 RunSimulation 编排落 `simulation_run`(**本卡不碰编排**)。

## 封闭文件清单

**新增**
- `packages/engines/src/main/java/com/mnext/engines/sim/AhpDecisionEngine.java`
- `packages/engines/src/test/java/com/mnext/engines/sim/AhpDecisionEngineTest.java`(纯单测)

**修改**
- `packages/engines/src/main/resources/META-INF/services/com.mnext.engines.sim.SimulationEngine`(**追加一行** `com.mnext.engines.sim.AhpDecisionEngine`;不动现有 echo/energy-soc/decision-topsis 行)

**零碰**:kernel、server、views、contracts、迁移、RunSimulation 编排、SimulationEngine SPI 签名、SimConfig/SimResult、TopsisDecisionEngine 及其它引擎文件。

## 红线 / 门禁

- 纯数值/确定式,无 I/O、无副作用、不读库(只吃 `DataSet` 快照)。
- 不改 SPI 签名 / SimConfig / SimResult / 编排;**不引新依赖**(纯 JDK,几何均值用 `Math.pow`,禁止引 commons-math 等)。
- 错误一律 `IllegalArgumentException`,消息前缀 `SIM-422-`(与 TOPSIS 一致,AG-311)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;engines 纯单测,**确认 engines 测试汇总 `Tests run: N, …, Skipped:0`**(+ `node scripts/check-no-skipped.mjs`)。
- AG-405 落盘自检(闭值/写纪律);完成发 `git diff --stat main`(**应仅三文件**:新引擎 + 新测试 + services 文件 +1 行)+ engines 测试汇总行。
- **基线落后只用 `git merge main` 拉平,别手动增删别的文件**(TOPSIS 那次教训);**在分支上提交但不要合并**(`feat/T-V33-ahp`)。
- 若发现需新增依赖、改 SPI、或暴露 SimConfig/SimResult 之外的能力缺口——**停下回报,不夹带**。

## 验收(单测覆盖)

1. **手算一致性强的 3 指标矩阵**(例:cost=price、benefit=quality、benefit=delivery 的两两比较),给 3 候选数值,**手算**几何均值权重、λ_max、CI/CR、候选得分与排名,断言 `criteriaWeights`(小数容差 1e-6 量级)、`consistencyRatio`、`consistent=true`、`ranking`、`bestCandidateId` 与手算一致。
2. **完全一致矩阵**(由一组权重构造 `m[i][j]=w_i/w_j`)→ 断言 `CR≈0`、`consistent=true`、权重还原。
3. **不一致矩阵**(CR>0.10)→ 断言 `consistent=false` 但**仍正常出 ranking**(不抛错)。
4. **边界**:非方阵 / 阶≠criteria 数 / 对角线≠1 / 非互反 / 元素≤0 → 抛 `SIM-422-`;缺候选字段 / cost 列含非正 → 抛错;候选超 1000、n<2 或 n>10 → 抛错。
5. **退化**:benefit 列全 0 → 该列归一为 0、不崩;tiebreak 源序确定。

## 跟进(本卡不做)
- 在比选只读查询里按"方法选择"调不同 `engineId`(加权和派生 / TOPSIS / AHP),把框架 §1-2 两层在查询侧打通(另卡,server 读侧)。
- 可选 doc:`contracts/仿真事件契约.md` 登记 `decision-ahp` 的 config/result 键(引擎目录文档化,非门禁)。
- 加权积(WPM)、ELECTRE 等更多方法同模式可加。
