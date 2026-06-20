# T-V33-REC-C — 推荐端点接入 AHP 方法(method=ahp)

蓝本:REC-B(`docs/tasks/T-V33-REC-B-方法选择推荐.md`)的跟进项"AHP 合并后加 `method=ahp`"。前置在 main(v1.40 含 REC-B 的 `method=weighted|topsis`;v1.39 含 `decision-ahp` 引擎)。**server 读侧**,含 Docker 集成测试(与其它 server e2e 错峰)。**照抄 REC-B 的 topsis 分支换 engineId/分值字段**即可。

定位:把"加权和 / TOPSIS / AHP 三方法可选"在**查询侧补齐**——REC-B 已做 weighted/topsis,本卡加第三个 `ahp`。读写分离不破(跑方法=写命令→simulation_run;推荐=只读 run 结果)。

## Run 解析规则(与 topsis 同构)
`method=ahp` →
1. 取该 workspace 内**最近一次 `status='COMPLETED'` 的 `engine_id='decision-ahp'` run**(复用 REC-B 已加的 `SimulationRunRepository.latestCompletedResult(workspaceId, engineId)`,**该方法已泛化、传 engineId 即可,不改仓储**);无则抛 `REC-409-NO-METHOD-RUN`(同 topsis 错误码与文案口径)。
2. 读其 `result.ranking`。**注意分值字段差异**:AHP 的 ranking 项是 `{candidateId, score, rank}`(用 `score`),TOPSIS 是 `{candidateId, closeness, rank}`(用 `closeness`)。
3. 用本项目活跃候选集(`recommendationCandidates(...)`)过滤 ranking、保序、重排 1..n、`limit(size)`;交集为空返回空推荐、不报错。
4. `details` 标 `method=ahp`;`score` 取 ranking 项的 `score`。

`method=weighted` / `method=topsis` 行为**逐字不变**(回归)。

## 范围

`GET /workspaces/{wid}/views/recommendations` 的 `method` 取值从 `{weighted, topsis}` 扩为 `{weighted, topsis, ahp}`(非法值仍 400)。新增私有 `ahpRecommendation(...)` + `ahpCandidate(...)`,**与 `topsisRecommendation`/`topsisCandidate` 同构,仅 engineId 用 `AHP_ENGINE_ID="decision-ahp"`、分值键用 `"score"`**。可抽公共 helper 复用(若改动小且不破坏 topsis 路径),否则照抄一份——**不得改动 topsis/weighted 既有分支逻辑**。

## 封闭文件清单

**修改**
- `packages/server/src/main/java/com/mnext/server/ViewQueryController.java`(method 枚举加 `ahp`;加 `ahpRecommendation`/`ahpCandidate`;`AHP_ENGINE_ID` 常量;**topsis/weighted 分支不动**)
- `packages/server/src/test/java/com/mnext/server/RecommendationMethodIntegrationTest.java`(**追加** ahp 场景,不改既有 topsis/weighted 断言)

**零碰**:`SimulationRunRepository`(latestCompletedResult 已泛化,直接复用)、kernel、engines、contracts、迁移、`ViewQueryDtos`、其它文件。

## 红线 / 门禁
- 只读零副本(AG-101/102);不写主数据、不碰 simulation 编排;**weighted/topsis 路径行为完全不变**(回归保证)。
- 复用 REC-B 的 `latestCompletedResult`,**不改仓储签名**;不引新依赖;不改 DTO/契约。
- 有界沿用现有上限(候选 ≤500、size 1..200)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;集成测试 Docker 起、server 汇总 **`Skipped:0`**(+ `node scripts/check-no-skipped.mjs`)。**与其它 server e2e 错峰**。
- AG-405 落盘自检;**在分支 `feat/T-V33-rec-c` 提交但不要合并**;基线落后只用 `git merge main` 拉平,别手动增删别的文件;完成发 `git diff --stat main`(应仅两文件)+ server 测试汇总行。
- 若 AHP 的 ranking 分值键名与本卡假设(`score`)不符、或需改仓储/DTO——**停下回报,不夹带**。

## 验收(集成测试,纯 API 无 JdbcTemplate 绕过)
1. 纯 API 建最小比选 profile + 3~4 候选(含 1 个非本项目同类型候选,验过滤);
2. 建快照 → `POST` 仿真 `engineId=decision-ahp` + criteria/comparisonMatrix 配置 → await 至 `COMPLETED`;
3. `GET recommendations?method=ahp&projectId=&relationTypeCode=`:仅本项目候选、按 AHP `score` 重排 rank 1..n、首位 recommended、score 与 run 结果一致、非本项目候选被过滤;
4. **无 run**:没跑过 ahp 的项目 → `REC-409-NO-METHOD-RUN`;
5. **回归**:`method=topsis` 与 `method=weighted` 在同数据上行为与 REC-B 一致(老路径没坏);
6. 非法 `method`(如 `foo`)→ 400;交集为空 → 空推荐不报错。

## 跟进(本卡不做)
- 比选模型声明默认方法(profile 配置),端点缺省读模型方法(需比选模型落地,另卡)。
- 推荐结果并入一票否决/风险标记(规则驱动过滤,另卡)。
