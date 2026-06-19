# T-V33-BID-A — 比选 profile 种子 + 加权闭环 e2e(MVP)

蓝本:`docs/比选工具-M-Next覆盖度评估.md` §5、`docs/比选决策引擎-框架设计稿.md` §6。前置全在 main(v1.34,含 tpl-api 纯 API 模板创作)。**纯 server e2e 测试卡**:零生产代码、零契约、零迁移。**全程纯 API**(用 tpl-api,不写任何测试 SQL)——同时验收 tpl-api。**Docker 集成测试,串行跑。**

## 目标

经纯 API 建一个最小"比选"profile 并断言加权比选闭环:建型→录候选与原始值→加权综合分(派生)→排名→规则(权重校验/一票否决/风险)→改一个候选值触发重算与排名变化。证明"比选工具核心 = 配置+派生+规则",且 tpl-api 纯 API 创作链在真实 profile 上跑通。

## 范围(全部走端点;模板用 tpl-api,零测试 SQL)

1. **建模板(tpl-api)**:`CreateTemplate` → 草稿版本上 `DefineObjectType/DefineFieldDef/DefineRelationType(templateVersionId)/DefineDerivedField/DefineRule` → `PublishTemplateVersion` → `InstantiateWorkspace`。**不得用 JdbcTemplate 建 scene_template 骨架**(tpl-api 已支持,本卡借此验收)。
2. **最小比选 profile**(具体、可手算):
   - `comparison_project`:`budget`(预算);
   - `candidate`:`name`、`price`、`quality`(0–100)、`delivery_days`;关系 `project_has_candidate`(project→candidate);
   - 三指标的**权重/方向/归一**作为配置体现在派生表达式里(MVP 固定参考归一,逐候选独立、可手算):
     - `candidate.score_price`(派生)= `(field('...budget...') - field('price')) / 预算基准`(min 更优);
     - `candidate.score_quality` = `field('quality')/100`(max 更优);
     - `candidate.score_delivery` = `(基准天数 - field('delivery_days')) / 基准天数`(min 更优);
     - `candidate.total_score`(派生)= `0.5*score_price + 0.3*score_quality + 0.2*score_delivery`(权重即配置)。
     - 预算/基准天数可取项目字段或常量(MVP 用常量或 require 注入;**不做跨候选 min/max 归一**,保持逐候选独立、可手算)。
   - 规则:`权重和=100%`(0.5+0.3+0.2,设计期校验,可作 meta 自检或文档断言)、`一票否决`:`price > 项目 budget` → BLOCK/告警、`风险`:`total_score < 阈值` → 告警。
3. **样例数据**:1 项目 + 3 候选(不同 price/quality/delivery,其中一个超预算)。
4. **断言(闭环)**:
   - 各候选 `total_score` = **手算期望值**;
   - 综合排名按 total_score(查询/视图)正确;
   - 超预算候选触发一票否决规则;低分候选触发风险规则;未超/未低的不触发;
   - **改一个候选的 price(降价)→ total_score 重算变大 → 排名变化**(闭环实证);
   - 全程无测试 SQL(tpl-api 建模板)。

## 封闭文件清单

**新增**
- `packages/server/src/test/java/com/mnext/server/BidComparisonE2EIntegrationTest.java`(`@SpringBootTest` 集成测试;setup/await 照抄 SysmlProfileE2E/Bus;但**模板创建走 tpl-api,不用 SQL**)

**零碰**:全部生产代码、contracts、迁移、kernel、engines、views;不改共享测试工具(helper 复制不改公共类)。

## 红线 / 门禁

- 只经现有命令/端点(含 tpl-api 的 CreateTemplate/CreateTemplateVersion);**不直插库**(本卡借此验收 tpl-api 的纯 API 链)。
- AG-504 不得 sleep;异步投影用既有 await 工具。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;**集成测试 Docker 起、server 汇总 Skipped:0**(+ `node scripts/check-no-skipped.mjs` 守卫)。
- AG-405 落盘自检;完成发 `git diff --stat main`(应仅一个测试文件 + 本卡 md)+ server 测试汇总。
- 若建型暴露能力缺口需改生产代码——**停,回报**,另开卡,不夹带。

## 验收
- 闭环跑通:建型(纯API)→样例→加权总分手算一致→排名正确→规则按阈值触发→改值重算+排名变化;
- tpl-api 纯 API 链(CreateTemplate→…→Instantiate)在真实 profile 上验收通过、零测试 SQL。

## 跟进(本卡不做)
- 方法引擎 SPI + TOPSIS(engines 纯单测卡,证"可插拔方法");
- 比选只读推荐查询端点(排序/推荐/备选/有界);
- 附件、雷达/柱状图、xlsx/pdf 导出、评分录入 UI;
- 能源 e2e 改用 tpl-api 删测试 SQL 脚手架(小卡)。
