# T-V33-REC-E — 推荐并入一票否决与风险标记

蓝本:REC-B/C/D 的共同跟进"推荐结果并入一票否决/风险标记(规则驱动过滤)"+ 比选 29 功能 §16/§17/§19。**前置:REC-D 合并后从含 REC-D 的 main 切**(本卡与 REC-D 同改 `ViewQueryController`,**串行,不与 REC-D 并行**)。**server 读侧**,含 Docker e2e(与其它 server e2e 错峰)。

定位:让推荐**尊重规则**——命中 BLOCK 的候选从推荐中剔除(列为"否决"),命中 WARN 的候选保留但打风险标。读侧、只读、复用既有 `check_result`,不改规则/写路径。

## 设计决断(已定:规则状态来自"最近一次规则检查批次")
- 推荐端点新增**可选** `ruleRunId`;**缺省 = 该 workspace 内最近一次 `COMPLETED` 的规则检查批次**(同 REC-B"读最近 run"模式,复用其 latest-completed 思路;规则检查批次有自己的 runId,见 `check_result`/RunRuleCheck)。
- 对每个候选,查它在该批次的 `check_result`:
  - 任一 **BLOCK** → 该候选**否决**:不进 `recommended`/`alternatives`,改列入新返回字段 `vetoed[]`(带触发的规则 code)。
  - 任一 **WARN** → 候选保留,`RankedCandidate.risks[]` 标注(规则 code + message)。
  - 无命中 → 正常参与排名。
- **无任何规则检查批次时**:不否决、不标风险(等同当前行为,向后兼容)——即"未跑检查=不过滤"。
- 适用于**所有 method**(weighted/topsis/ahp/wpm):先按 method 算分排名,再叠加否决剔除 + 风险标注。**method 各分支的算分逻辑不变**(只在产出 `RankedCandidate` 后做过滤/标注)。

## 范围
- `GET /workspaces/{wid}/views/recommendations` 新增可选 `ruleRunId`;产出后:
  - 用 `check_result`(该 run)对候选分类:vetoed / risk-flagged / clean;
  - `recommended` + `alternatives` 只从**非否决**候选取(保持原 method 排序);否决候选进 `vetoed[]`。
- DTO 扩展:`RecommendationView` 加 `vetoed: List<RankedCandidate>`;`RankedCandidate` 加 `risks: List<{ruleCode, severity, message}>`、`vetoed: boolean`(或等价结构)。**新增字段,不破坏现有字段**(现有 UI/测试读旧字段仍可用)。
- 只读、有界:沿用候选 ≤500、size 1..200;`check_result` 查询按 run+候选有界。

## 封闭文件清单
**修改**
- `packages/server/src/main/java/com/mnext/server/ViewQueryController.java`(加 `ruleRunId` 参 + 否决/风险叠加;各 method 分支算分不动,只在产出后过滤标注)
- `packages/server/src/main/java/com/mnext/server/ViewQueryDtos.java`(`RecommendationView` 加 `vetoed`;`RankedCandidate` 加 `risks`/`vetoed`)
- `packages/server/src/test/java/com/mnext/server/RecommendationMethodIntegrationTest.java`(追加 否决/风险 场景)
- (若需按 run+对象查 check_result)`packages/server/src/main/java/com/mnext/server/CheckResultRepository.java` 或 `ReadModelRepository`(**加只读查询**,不改既有方法)

**零碰**:kernel、engines、contracts、迁移、规则引擎/RunRuleCheck、命令侧、其它文件。

## 红线 / 门禁
- 只读零副本(AG-101/102);**不改规则引擎/检查写路径**;只读 `check_result`。
- **各 method 现有算分行为完全不变**(否决/风险是产出后的叠加层);**无规则批次时行为 = 当前**(向后兼容,现有 REC 测试不应被改;若被迫改→停下回报)。
- DTO **只增字段不改旧字段**;有界沿用上限;不引新依赖;不改契约/迁移。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped)。**与其它 server e2e 错峰**。
- AG-405 落盘自检;**分支 `feat/T-V33-rec-e` 提交不合并**;**从 REC-D 已合的 main 切**;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- 若否决/风险需改 method 算分、或 check_result 无法按 run+候选查、或需改 DTO 旧字段——**停下回报,不夹带**。

## 验收(集成测试,纯 API)
1. 纯 API 建比选 profile + 4 候选 + 派生 total_score + 两条规则:`price>budget` BLOCK、`total_score<阈值` WARN;
2. `RunRuleCheck` 跑一批 → 得 ruleRunId;构造数据使候选 G 命中 BLOCK、候选 B 命中 WARN;
3. `GET recommendations?method=weighted&scoreField=total_score`(缺省 ruleRunId=最近批次):
   - `vetoed[]` 含 G(带 `price_over_budget`),`recommended`/`alternatives` **不含 G**;
   - B 在排名内但 `risks[]` 标 `total_score_low`(WARN);
   - 其余候选 clean、排名与未过滤时一致(算分未变)。
4. **method 通用**:同样数据用 `method=topsis`(先跑 decision-topsis)→ 否决/风险叠加一致;
5. **向后兼容**:不传 ruleRunId 且无任何检查批次 → 行为同当前(无否决无风险,旧字段不变);
6. 显式传不存在的 ruleRunId → 报错或空(明确,不静默);非法 method→400。

## 跟进(本卡不做)
- 比选模型声明"默认规则集/检查策略";推荐时自动跑检查(写,另卡);
- 风险分级(高/中/低)与可配阈值。
