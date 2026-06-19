# T-V33-ENERGY-B-SOC — SOC 逐轨时序数值算子(A 类自研轻引擎)

蓝本:`docs/执行引擎策略-fUML-spike.md` §2(A 类:自研轻量数值算子,挂 SimulationEngine SPI);能源可行性备忘"长板2"。前置全在 main(v1.33)。

**关键定位**:勘察后确认——仿真框架是通用的(`SimulationEngine` SPI + 泛化 `SimConfig`/`SimResult` + ServiceLoader 注册 + 通用 RunSimulation 编排/simulation_run 表/端点)。所以 SOC = **新增一个 `SimulationEngine` 实现 + 注册**,**复用现有 RunSimulation,零命令、零契约、零迁移**。**纯 engines 单测,无需 Docker。**

## 范围

新增能源 SOC(蓄电池荷电状态)逐轨时序算子 `EnergySocSimulationEngine`(engineId=`energy-soc`),实现 `SimulationEngine.run(DataSet snapshot, SimConfig config) → SimResult`:

- **读快照**(只读,AG-105):从 `snapshot.objects()` 按能源 profile 字段 code 取——
  - `mission_orbit`:`sunlight_min`、`eclipse_min`;
  - `battery_pack`:`capacity_wh`、`discharge_efficiency`(可选 `charge_efficiency`);
  - 放电负荷:取各 `operating_mode` 的 `eclipse_power_w` 最大值(阴影工况)。
  - 缺必需对象/字段 → 抛 `IllegalArgumentException`(消息含 `SIM-422-` 前缀,说明缺什么);引擎是能源域专用,认这些字段 code。
- **配置**(`SimConfig.parameters`):`timestepMinutes`(默认 1)、`initialSocRatio`(默认 1.0)、`rechargePowerW`(光照期净充电功率,工程输入)。
- **计算**(单轨、定步长积分):
  - 放电段(eclipse_min):每步 `dt`,放电量 `= eclipse_power_w * (dt/60) / discharge_efficiency`(Wh),`soc_wh -= 放电量`,下限钳 0;
  - 充电段(sunlight_min):每步充电量 `= rechargePowerW * (dt/60) * charge_efficiency`,`soc_wh += `,上限钳 `capacity_wh`;
  - 记录 SOC 曲线。
- **输出** `SimResult.values`:`engineId`、`socCurve`(`[{minute, socRatio}]`)、`minSocRatio`、`maxDodRatio`(=1-minSoc)、`endSocRatio`、`capacityWh`、`stepMinutes`。
- **有界**(AG-202/203 式):总步数 `(sunlight_min+eclipse_min)/timestep ≤ MAX_STEPS=5000`,超限抛 `IllegalArgumentException`(`SIM-422-` 前缀);不静默截断。
- **纯函数**:无 I/O、无副作用、不写库;结果由现有 RunSimulation 编排落 `simulation_run`(已具备),不在本卡碰编排。

## 封闭文件清单

**新增**
- `packages/engines/src/main/java/com/mnext/engines/sim/EnergySocSimulationEngine.java`
- `packages/engines/src/test/java/com/mnext/engines/sim/EnergySocSimulationEngineTest.java`(纯单测)

**修改**
- `packages/engines/src/main/resources/META-INF/services/com.mnext.engines.sim.SimulationEngine`(加一行 `com.mnext.engines.sim.EnergySocSimulationEngine`,Echo 已在其中)

**零碰**:kernel、server、views、contracts、迁移、RunSimulation 编排(Controller/Runner/Repository/Bridge 不动)。

## 红线 / 门禁

- 纯求值/数值,无 I/O、无副作用、不读数据库(只吃传入的 `DataSet` 快照)。
- 不改 SimulationEngine SPI 签名、不改 SimConfig/SimResult、不动 RunSimulation 编排。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;engines 为纯单测,**确认 engines 测试汇总 Skipped:0**(顺带 `node scripts/check-no-skipped.mjs` 守卫)。
- AG-405 落盘防截断自检。完成发 `git diff --stat main`(应仅这三文件)+ engines 测试汇总。

## 验收(单测覆盖)
- 给一个小快照(orbit:sunlight=60/eclipse=30;battery:capacity_wh=100、discharge_efficiency=0.9;mode:eclipse_power_w=60)+ config(timestep=10、initialSoc=1.0、rechargePowerW=80),**手算预期 SOC 轨迹**,断言 `socCurve` 各点、`minSocRatio`、`maxDodRatio` 与手算一致;
- 边界:缺 battery/orbit → 抛错;步数超限 → 抛错;
- 钳制:放电不破 0、充电不超 capacity。

## 跟进(本卡不做,登记)
- **结果回灌**:把 `minSocRatio`/`maxDod` 作为字段回灌到 battery 对象供下游派生/规则消费(需一个"仿真结果→模型字段"回填机制,另起卡);
- 可选 doc:在 `contracts/仿真事件契约.md` 登记 `energy-soc` 引擎的 config/result 键(引擎目录文档化,非 schema 门禁);
- 能源阶段B 其余:选型推荐、interp 化衰减/DOD(各自独立小卡)。
