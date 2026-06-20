# T-V33-REC-B — 推荐端点方法选择(打通两层框架)

蓝本:`docs/比选决策引擎-框架设计稿.md` §1-3 + REC-A 卡跟进("按比选模型的方法选择调不同方法引擎")。前置在 main(v1.38,含 REC-A 推荐端点、`decision-topsis` 引擎、simulation_run 编排)。**server 读侧**。含 Docker 集成测试——**与附件卡(及其它 server e2e)错峰跑**。与 AHP(engines)、附件(attachment 新文件)**文件零冲突**。

定位:让推荐端点从"只会加权派生一条路"升级为**可选方法**——`weighted`(现有派生)或 `topsis`(读最近一次 `decision-topsis` 方法运行的排名),把"比选模型 + 可插拔方法引擎"两层在**读侧**真正闭合。读写分离不破:**跑方法=写命令→simulation_run;推荐=只读取结果**。AHP 合并后同模式加 `method=ahp` 即可(本卡不做)。

## Run 解析规则(产品负责人已确认,确定式、只读)
`method=topsis` →
1. 取该 **workspace 内最近一次 `status='COMPLETED'` 的 `engine_id='decision-topsis'` run**(按 `completed_at DESC, run_id` 取首条);无则抛 `REC-409-NO-METHOD-RUN`("先对该项目跑一次 decision-topsis 方法再看推荐")。
2. 读其 `result.ranking`(`[{candidateId, closeness, rank}]`)。
3. 取本项目活跃候选 id 集合(复用 `recommendationCandidates(workspaceId, projectId, relationTypeCode, …)`),**用它过滤** ranking(只保留既在 run 排名里、又是本项目候选的对象);保持 TOPSIS 既有顺序(closeness 已排),**重排 rank 1..n**,`limit(size)`。
4. 交集为空 → 返回空推荐(`recommended=null, alternatives=[]`),**不报错**(与 weighted 路径空候选行为一致)。

`method=weighted`(默认)= REC-A 现有路径,**逐字不动**。

## 范围(只读)

端点扩展:`GET /workspaces/{wid}/views/recommendations` 新增 `@RequestParam(value="method", defaultValue="weighted")`。
- 校验:`method ∈ {weighted, topsis}`,否则 `IllegalArgumentException`(400);
- `scoreField`:**weighted 必填**(保持现状);**topsis 忽略**(允许留空——topsis 用 closeness,不用派生字段)。把现有 `scoreField.isBlank()` 校验改为**仅 weighted 分支生效**。
- `topsis` 分支按上节 Run 解析规则产出 `RankedCandidate`:`score=closeness`、`details` 可标 `method=topsis, runId=<uuid>`(可选,便于追溯),其余字段(objectTypeCode/fields)取自项目候选的 `ObjectView`。
- 复用现有 `RecommendationView` / `RankedCandidate`,**DTO 不改**。
- 有界沿用:候选/排名已被引擎(MAX 1000)和 `recommendationCandidates`(MAX 500)有界;`size` 1..200。

新增仓储读方法(`SimulationRunRepository`,纯只读):
```
Optional<Map<String,Object>> latestCompletedResult(UUID workspaceId, String engineId)
// SELECT result::text FROM simulation_run
// WHERE workspace_id=? AND engine_id=? AND status='COMPLETED'
// ORDER BY completed_at DESC, run_id LIMIT 1  → 解析 jsonb→map;无行返回 empty
```
`ViewQueryController` 构造器**追加注入** `SimulationRunRepository`(同包,additive)。

## 封闭文件清单

**修改**
- `packages/server/src/main/java/com/mnext/server/ViewQueryController.java`(加 `method` 参、topsis 分支与私有 helper、构造器注入 `SimulationRunRepository`、`scoreField` 校验改为仅 weighted)
- `packages/server/src/main/java/com/mnext/server/SimulationRunRepository.java`(**新增**只读 `latestCompletedResult`;不动现有方法)

**新增**
- `packages/server/src/test/java/com/mnext/server/RecommendationMethodIntegrationTest.java`

**零碰**:kernel、engines、views/web、contracts、迁移、`ViewQueryDtos`、REC-A 的 weighted 路径逻辑、TOPSIS 引擎、附件/AHP 的文件、simulation 编排(只读取 simulation_run,不改写入/状态机)。

## 红线 / 门禁
- 只读零副本(AG-101/102);不写主数据、不改 simulation 编排/状态机;`weighted` 路径行为**完全不变**(回归保证)。
- 有界(AG-202/203)沿用现有上限;新错误码 `REC-409-NO-METHOD-RUN`(AG-311 前缀风格,与既有 `REC-`/`SIM-` 一致;若现状推荐端点无 `REC-` 前缀先例,则沿用端点既有错误约定,保持一致而非新造体系——以现状为准)。
- 不引新依赖;不改 SPI/契约/DTO。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;集成测试 Docker 起、server 汇总 **`Skipped:0`**(+ `node scripts/check-no-skipped.mjs`)。**与附件卡错峰 verify**。
- AG-405 落盘自检;**在分支 `feat/T-V33-rec-b` 提交但不要合并**;基线落后只用 `git merge main` 拉平,别手动增删别的文件;完成发 `git diff --stat main`(应仅三文件)+ server 测试汇总行。
- 若需改 DTO/契约、或读取 simulation_run 需暴露编排内部、或交集语义有歧义需扩范围——**停下回报,不夹带**。

## 验收(集成测试,纯 API 无 JdbcTemplate 绕过)
1. 纯 API 建最小比选 profile(项目 + 候选类型 + `project_has_candidate` + 候选数值字段)+ 3~4 候选(其中含 1 个**不属于本项目**的同类型候选,用于验过滤);
2. 建快照 → `POST` 仿真 `engineId=decision-topsis` + criteria 配置 → await 至 `COMPLETED`;
3. `GET recommendations?method=topsis&projectId=&relationTypeCode=`(scoreField 留空):
   - 返回**仅本项目候选**(那个非本项目候选被过滤掉)、按 closeness 重排 rank 1..n、首位 `recommended`、`score=closeness` 与 run 结果一致;
4. **无 run**:换个没跑过 topsis 的项目/workspace → `REC-409-NO-METHOD-RUN`;
5. **method=weighted**(回归):同数据走派生路径,结果与 REC-A 行为一致(证明老路径没坏);
6. **非法 method**(如 `foo`)→ 400;`method=weighted` 且 `scoreField` 空 → 400(保持原校验);
7. 交集为空(项目候选都不在最近 run 里)→ 返回空推荐、不报错。

## 跟进(本卡不做)
- AHP 合并后加 `method=ahp`(同模式,读 `decision-ahp` 最近 run)。
- 让比选"模型"声明默认方法(profile 配置),端点缺省读模型方法(需比选模型落地,另卡)。
- 推荐结果并入一票否决/风险标记(规则驱动过滤,另卡)。
