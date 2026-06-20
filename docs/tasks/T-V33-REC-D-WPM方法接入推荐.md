# T-V33-REC-D — 推荐端点接入 WPM 方法(method=wpm)

蓝本:REC-C(`docs/tasks/T-V33-REC-C-AHP方法接入推荐.md`)同模式。前置在 main(v1.44,含 `decision-wpm` 引擎 v1.43、REC-B/REC-C 的 `method=weighted|topsis|ahp`)。**server 读侧**,含 Docker 集成测试(与其它 server e2e 错峰)。**照抄 ahp 分支换 engineId=decision-wpm**(WPM 的 ranking 分值键同为 `score`)。

定位:把"加权和 / TOPSIS / AHP / **WPM**"四方法可选在查询侧补齐。读写分离不破(跑方法=写命令→simulation_run;推荐=只读 run 结果)。

## Run 解析规则(与 ahp 同构)
`method=wpm` →
1. 取该 workspace 内**最近一次 `status='COMPLETED'` 的 `engine_id='decision-wpm'` run**(复用 `SimulationRunRepository.latestCompletedResult(workspaceId, engineId)`,**已泛化、不改仓储**);无则抛 `REC-409-NO-METHOD-RUN`(同口径)。
2. 读其 `result.ranking`(`{candidateId, score, rank}`,**用 `score` 键**,与 AHP 同;与 TOPSIS 的 `closeness` 不同)。
3. 用本项目活跃候选集(`recommendationCandidates`)过滤 ranking、保序、重排 1..n、`limit(size)`;交集为空返回空、不报错。
4. `details` 标 `method=wpm`;`score` 取 ranking 项的 `score`。

`method=weighted/topsis/ahp` 行为**逐字不变**(回归)。

## 范围

`GET /workspaces/{wid}/views/recommendations` 的 `method` 取值从 `{weighted, topsis, ahp}` 扩为 `{weighted, topsis, ahp, wpm}`(非法值仍 400)。新增私有 `wpmRecommendation(...)` + `wpmCandidate(...)`,**与 `ahpRecommendation`/`ahpCandidate` 同构,仅 engineId 用 `WPM_ENGINE_ID="decision-wpm"`**(分值键同为 `score`)。**不得改动 weighted/topsis/ahp 既有分支逻辑**。

> 若发现 ahp 与 wpm 分支可干净抽公共方法(只差 engineId),可抽——但前提是**不改变 ahp/topsis/weighted 现有行为**;拿不准就照抄一份。

## 封闭文件清单

**修改**
- `packages/server/src/main/java/com/mnext/server/ViewQueryController.java`(method 枚举加 `wpm`;加 `wpmRecommendation`/`wpmCandidate`;`WPM_ENGINE_ID` 常量;**其它分支不动**)
- `packages/server/src/test/java/com/mnext/server/RecommendationMethodIntegrationTest.java`(**追加** wpm 场景,不改既有断言)

**零碰**:`SimulationRunRepository`(latestCompletedResult 已泛化)、kernel、engines、contracts、迁移、`ViewQueryDtos`、其它文件。

## 红线 / 门禁
- 只读零副本(AG-101/102);不写主数据、不碰 simulation 编排;**weighted/topsis/ahp 路径行为完全不变**(回归保证)。
- 复用 `latestCompletedResult`,不改仓储签名;不引新依赖;不改 DTO/契约/迁移。
- 有界沿用现有上限(候选 ≤500、size 1..200)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;Docker 起、server 汇总 **`Skipped:0`**(+ `node scripts/check-no-skipped.mjs`)。**与其它 server e2e 错峰**。
- AG-405 落盘自检;**分支 `feat/T-V33-rec-d` 提交不合并**;基线落后只 `git merge main` 拉平,别手动增删别的文件;完成发 `git diff --stat main`(应仅两文件)+ server 测试汇总行。
- 若 WPM 的 ranking 分值键名与本卡假设(`score`)不符、或需改仓储/DTO——**停下回报,不夹带**。

## 验收(集成测试,纯 API 无 JdbcTemplate 绕过)
1. 纯 API 建最小比选 profile + 3~4 候选(含 1 个非本项目同类型候选,验过滤);
2. 建快照 → `POST` 仿真 `engineId=decision-wpm` + criteria 配置 → await 至 `COMPLETED`;
3. `GET recommendations?method=wpm&projectId=&relationTypeCode=`:仅本项目候选、按 WPM `score` 重排 rank 1..n、首位 recommended、score 与 run 结果一致、非本项目候选被过滤;
4. **无 run**:没跑过 wpm 的项目 → `REC-409-NO-METHOD-RUN`;
5. **回归**:`method=topsis`/`ahp`/`weighted` 在同数据上行为与之前一致(老路径没坏);
6. 非法 `method`(如 `foo`)→ 400;交集为空 → 空推荐不报错。

## 跟进(本卡不做)
- 比选模型声明默认方法(profile 配置),端点缺省读模型方法(需比选模型落地,另卡)。
- 推荐结果并入一票否决/风险标记(规则驱动过滤,另卡)。
