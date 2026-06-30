# T-V35-C1 — MBSE 演示数据加厚(灯塔领域做穿·第一步)

> **packages/server(DevSeedRunner)域,后端;零迁移、零写入语义变更。** 前置:main(DOMAIN3-LIVE 已种基础 MBSE demo)。
> 灯塔线第一步:先有"够真实、可演示"的验证数据,后续覆盖/裕度/仪表才有东西可显。

## 目标
把 MBSE Demo(workspace `33333333-…`)从"最小样例"加厚到**可演示验证闭环**:一个任务下十几条需求,各自有/无对应测试与结果,**含通过 / 失败 / 未覆盖三态**,使 `verify_status_fx` 等派生有丰富红绿、覆盖视图有看头。

## 现状(已核实)
- `mbse` manifest:objTypes mission/mission_context/phase/env_condition/capability/requirement/test_case/test_result;关系 occurs_in/imposes/requires/derives/verified_by/produces;派生 requirement_count_fx/required_requirement_min_fx/verify_status_fx;规则 R-COV-01/R-VER-01/R-VER-02;required 字段含 requirement.{code,text,target,margin_threshold}、test_result.{value,verdict}。
- `DevSeedRunner` 已种最小 MBSE demo(DOMAIN3-LIVE);经既有 install/instantiate/createObject/createRelation。

## 范围(后端,零迁移)
- **A. 加厚 MBSE 种子**(参照现有写法,仅扩 DevSeedRunner):
  - 1 个 mission + mission_context + 2~3 phase(各挂 env_condition,occurs_in/imposes)。
  - mission_context `requires` 3~4 capability;各 capability `derives` 3~4 requirement(合计 **≥12 requirement**,字段含 code/text/target/margin_threshold)。
  - 覆盖三态分布:
    - **通过**:requirement `verified_by` test_case,test_case `produces` test_result(verdict=pass,value 满足 target±margin)。
    - **失败**:有 test_case/result 但 verdict=fail 或 value 越界。
    - **未覆盖**:requirement 无 verified_by(或有 test_case 无 result)。
  - 字段严格按 manifest required;派生(verify_status_fx 等)能算出,规则有判定。
- **B. 幂等**:已加厚则跳过(按某标志/数量判断,不重复种)。
- **C. runChecksAfterReadModelReady**:跑 MBSE 规则校验 + 就绪日志。
- **D. 不改**:写入/命令语义、迁移、manifest 本身(本卡只种数据;manifest 派生/规则留 C2)、室内/技术方案/其它种子。

## 封闭文件清单
**修改**:`packages/server/.../DevSeedRunner.java`;扩 `DevSeedRunnerIntegrationTest`(断言 MBSE 三态数据可查、verify_status 有红绿)。
**零碰**:迁移、写入语义、manifest、其它领域种子、前端。

## 红线 / 门禁
- 仅扩 dev 种子,经既有命令;**零迁移、零写入语义变更**;幂等不重复种、不影响其它 demo。
- 字段/关系严格按 mbse manifest(不杜撰);派生与规则能算出。
- Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`,含后端 E2E)。
- 分支 `feat/T-V35-c1-mbse-seed-rich` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡文件;发 `git diff --stat main` + 测试汇总。命中红线停下回报,不夹带。

## 验收
1. dev 重置+重起后,MBSE Demo 有 1 任务 / ≥12 需求 / 通过·失败·未覆盖三态齐全;图/树/表可查。
2. `verify_status_fx` 等派生在三态上分别给出对应值;R-VER/R-COV 规则灯按判定显示。
3. 其它 demo 零回归;verify 全绿 Skipped:0;无迁移/写入 diff。

## 跟进(本卡不做)
C2 裕度派生+规则;C3 覆盖汇总端点;C4 验证仪表。
