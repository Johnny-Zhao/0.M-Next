# T-V33-REC-A — 比选推荐只读查询端点(MVP)

蓝本:`docs/比选决策引擎-框架设计稿.md` §3(推荐流程,只读)。前置在 main(v1.35,含 meta-ids;派生层/DerivedEvaluator 已有)。**server 读侧**。与 BID(只动其测试文件)、TOPSIS(engines)**文件零冲突**;但本卡含 Docker 集成测试,**verify 与 BID 错峰跑**。

## 目标

给一个比选项目,按某个(派生)评分字段对其候选排序,返回"推荐(首位)+ 备选(其余)",只读、有界。MVP 只做"排序+推荐/备选",资格/否决过滤留后续。

## 范围(只读)

新增端点:`GET /workspaces/{wid}/views/recommendations?projectId=&relationTypeCode=&scoreField=&order=desc|asc&size=`

- **候选集**:`rm_relation` 里 `source_id=projectId AND relation_type_code=relationTypeCode AND status='ACTIVE'` 的 target 对象(即项目下的候选);分页/有界。
- **评分**:对每个候选,用既有 `DerivedEvaluator` 求 `scoreField`(候选类型上的派生字段 code)的值;**复用现成派生求值,不新造计算**。
- **排序 + 推荐/备选**:按 score 排序(order),首位标 `recommended=true`,其余 `alternatives`;有界 top-N。
- **返回**(`RecommendationView`):`[{candidateId, objectTypeCode, score, rank, recommended, fields(关键)}]`。
- **只读**(AG-101/102):不写主数据、零副本;**有界**(AG-202/203):候选数 ≤ `MAX_CANDIDATES=500`、size ≤ 200,超限报错或截断到上限(明确,不静默)。
- scoreField 求值失败/非数值候选:按约定置末位或报错(MVP:置 null 分、排末位,details 标注)。

## 封闭文件清单

**修改**
- `packages/server/src/main/java/com/mnext/server/ViewQueryController.java`(加 `recommendations` 端点 + 参数校验:relationTypeCode 非空、size 1..200)
- `packages/server/src/main/java/com/mnext/server/ReadModelRepository.java`(加查询:按 project+relationType 取候选对象,有界)
- `packages/server/src/main/java/com/mnext/server/ViewQueryDtos.java`(加 `RecommendationView`/`RankedCandidate`)
- 编排:控制器注入既有 `DerivedEvaluator`,对候选逐个求 scoreField 后排序(若控制器不便,放一个小私有方法/既有 service,**不新增公共类**除非必要)

**新增**
- `packages/server/src/test/java/com/mnext/server/RecommendationQueryIntegrationTest.java`

**零碰**:kernel、engines、views/web、contracts、迁移、命令侧、BID/TOPSIS 的文件。

## 红线 / 门禁

- 只读零副本(AG-101/102);候选/返回有界(AG-202/203);复用 DerivedEvaluator,不新造计算/写路径。
- 测试建 profile **走 tpl-api + meta-ids 纯 API 取 id**(不碰 JdbcTemplate);异步投影用既有 await;AG-504 不 sleep。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;集成测试 Docker 起、server 汇总 **Skipped:0**(+ 守卫)。**与 BID 错峰跑**(别同时占 Docker)。
- AG-405 落盘自检;完成发 `git diff --stat main` + server 测试汇总。
- 若需新增命令/读端点之外的能力或暴露缺口——停下回报,不夹带。

## 验收(集成测试)
- 纯 API 建最小比选 profile(项目 + 候选 + `project_has_candidate` 关系 + 派生 `total_score`)+ 3 候选;
- 调 recommendations(scoreField=total_score, order=desc):返回按 total_score 降序、首位 recommended、其余 alternatives,score 值与派生一致;
- 有界:size 限制生效;候选超限按约定;
- 边界:relationTypeCode 缺失/非法 size 报错;无候选返回空列表(非报错)。

## 跟进(本卡不做)
- 资格/否决过滤(规则驱动)+ 风险标记并入推荐结果;
- 按比选模型的"方法选择"调不同方法引擎(加权和派生 / TOPSIS),把 §1-2 两层打通;
- 雷达/柱状对比图(UI)。
