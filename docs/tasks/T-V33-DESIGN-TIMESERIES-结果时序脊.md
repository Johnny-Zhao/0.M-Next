# T-V33-DESIGN-TIMESERIES — 设计稿:结果时序脊(动态/动画)

> **本卡产出设计稿,不写实现。** 蓝本:`docs/设计-领域定制能力边界.md` §3.5 / §4。
> 重轨:平台从"静态结构"扩成"结构 + 观测/结果"两条脊,需专门设计后再拆实现卡。

## 目标
设计一套支撑**动态/动画/动态仿真**的数据与视图架构:时变结果序列的存储、查询、与视图的时间维绑定、以及外部仿真适配(FMI)。

## 现有地基(已核实——别从零起)
- **`simulation_run` 表(server V8)已存在**:run_id、workspace_id、**snapshot_id(锚定模型版本)**、engine_id、status、config JSONB、**result JSONB**、result_hash、queued/started/completed_at、created_by、failure_reason + 按 workspace/status 的索引。即"**异步仿真作业 + 结果**"骨架已在,`result` 现为整块 blob。
- `SimulationRun*`(server)相关读写;`engines/exchange/sysml/SysmlXmiCodec`(XMI 地基)。
- **设计要点**:时序脊 = 在 simulation_run 之上加**细粒度结果序列层** `(run_id, object_id/field, t, value)`(blob → 可查序列),而非另起一套 run 模型;run 锚定 snapshot 即"这次仿真对应哪个模型版本",过期判定可由此推。

## 设计稿须覆盖
1. **结果时序数据层**:独立于 rm_object 的结果存储模型——按 `(run_id, object_id/field, t)` 索引;数据规模/写入吞吐/保留策略;与版本/快照/血缘的关系(一次 run 锚定哪个模型版本);只读时序查询 API 形态(按对象/字段/时间窗/降采样)。
2. **计算来源与编排**:transient(Modelica)、状态机/活动 token、优化迭代、离散事件;均经事件/outbox→投影异步产出;**播放只读预算好的序列,不在帧循环现算**。
3. **FMI/FMU 适配**:借 FMI(模型交换 + 协同仿真)耦合外部仿真器的接口形态(L3 SPI);FMU 导入导出在 codec/transformation 体系的落点。
4. **时间维视图绑定**:playhead + 时间轴拖拽 + 时序→视觉编码(颜色/位置/大小/标签)的声明式绑定;在现有视图(平面图热力图/图 token 流/矩阵填充)之上作动画层,而非新视图。
5. **性能/复杂度护栏**:延续"转换异步、覆盖预投影、profile 廉价过滤、骨架预加载/实例懒加载";时序数据不进 rm_object 热路径。
6. **分期与依赖**:最小可用(单变量 transient 回放)→ 多变量/多 run 对比 → 协同仿真;与映射 profile(转换产出)/能力边界各面的关系。
7. **红线**:写入经命令入口、视图只读零拷贝、契约/迁移人工发起、仿真/转换不进同步视图路径。

## 交付
- `docs/设计-结果时序脊与动态仿真.md`(含数据模型、API 形态、视图绑定、FMI 适配、分期、红线)。
- 不写代码、不开实现卡(实现卡待设计评审后另拆)。

## 红线
纯设计文档;不动代码/契约/迁移。完成发文档路径供评审。
