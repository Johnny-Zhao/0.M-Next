# T-V34-TIMESERIES-T1 — 结果时序脊后端(最小可用)

> 蓝本:`docs/设计-结果时序脊与动态仿真.md` 第 1/2.1/4 节(T1)。
> **packages/server 域,后端;含一处迁移(锁 V27)。** 前置:main(simulation_run/V8 已在;OCL/阶段一/二/三已合)。
> 范围只做**后端数据脊 + 只读端点**;前端时间维绑定(playhead/编码)留 **T1-fe 跟进卡**。

## 目标
在已有 `simulation_run` 之上长出**细粒度结果时序层**,使时变结果可按对象/字段/时刻只读查询——为后续动画/动态仿真打底。

## 现状(已核实)
- `simulation_run`(server V8):`run_id, workspace_id, snapshot_id, engine_id, status, config jsonb, result jsonb, result_hash, queued/started/completed_at, created_by, failure_reason` + 按 workspace/status 索引。已是"异步仿真作业 + 结果(整块 blob)"骨架。
- `SimulationRun*`(server)读写 + `SimulationIntegrationTest`(enqueue/drain/幂等/状态机)绿。
- 视图查询全走 `ViewQueryController` 只读端点。

## 范围(T1,后端)
- **A. 迁移(锁 `V27`,server 目录)** `sim_result_series`:
  `run_id UUID NOT NULL REFERENCES simulation_run(run_id) ON DELETE CASCADE, workspace_id UUID NOT NULL, object_id UUID NOT NULL, field_code VARCHAR(128) NOT NULL, t DOUBLE PRECISION NOT NULL, value DOUBLE PRECISION NULL, value_json JSONB NULL`;主键/索引 `(run_id, object_id, field_code, t)` + 按 (run_id) 查询索引。**纯新增表,级联随 run 删。**
- **B. 落序列**:run 完成后,把结果**批量落 `sim_result_series`**。T1 最简实现:在现有 run 完成路径加一个**确定性产出器**——从 `simulation_run.result`(或引擎产出)解析出 (object, field, t, value) 批量写入。经既有作业/写入路径,**异步、不进同步视图路径**。若 result 结构不含时序则 T1 产出器可空跑(留 0 行),不报错。
- **C. 只读查询端点**(沿用 `/views/*` 风格):
  - `GET /workspaces/{ws}/views/sim-runs`(列 run:id/engine/status/时间)
  - `GET /workspaces/{ws}/views/sim-runs/{runId}/series?object&field&from&to&downsample&page&size`(按对象/字段/时间窗取序列,**降采样 + 分页 + 上限**)
- **D. 不改**:simulation_run 既有语义、写入命令、读模型投影、rm_object(序列**不**进 rm_object 热路径)、其它端点。

## 封闭文件清单
**修改/新增**:`packages/server/.../db/migration/V27__sim_result_series.sql`、结果产出器(run 完成路径,server)、`SimResultSeriesRepository`(只读查询)、`ViewQueryController`(两端点)、`ViewQueryDtos`(series DTO)、相关只读 + 落序列 E2E。
**零碰**:simulation_run 既有读写语义、写入命令、读模型投影、rm_object、前端、其它领域。

## 红线 / 门禁
- **写入(落序列)经既有作业/写入路径,异步;视图只读零拷贝;序列不污染 rm_object。**
- 迁移**仅新增表(锁 V27)**、级联随 run、既有数据零破坏。
- 查询分页/降采样/上限;大序列服务端降采样后再传。
- 现有功能零回归;Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`)。
- 分支 `feat/T-V34-timeseries-t1` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡相关文件;发 `git diff --stat main`(含 V27)+ 测试汇总。命中红线(动 simulation_run 语义/读模型/同步视图路径)停下回报,不夹带。

## 验收
1. 一个 run 完成后,`sim_result_series` 落入对应序列(无时序结果则 0 行、不报错)。
2. `GET /views/sim-runs` 列出 run;`GET /views/sim-runs/{id}/series` 按对象/字段/时间窗 + 降采样 + 分页正确返回。
3. 只读、无 simulation_run/读模型/rm_object diff;现有 simulation/视图测试零回归;verify 全绿 Skipped:0。

## 跟进(本卡不做)
- **T1-fe**:某视图(如平面图热力图)的 playhead + 时序→视觉编码绑定(只读 series 端点)。
- T2:多变量/多 run 对比、状态机 token 动画、降采样策略。
- T3:FMI 协同仿真(FMU 导入导出 + 外部求解器)。
