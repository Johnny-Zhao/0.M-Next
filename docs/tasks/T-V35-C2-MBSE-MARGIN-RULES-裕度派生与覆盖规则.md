# T-V35-C2 — MBSE 裕度派生 + 覆盖规则(灯塔线·第二步)

> **packages/domains/mbse(manifest)+ packages/server(重种/校验)域;声明式为主,零迁移。** 前置:C1(数据加厚已合)。
> 让验证闭环"算得出对错":需求的裕度判定 + 覆盖/失败规则,经声明式 manifest(派生用表达式,可用 m-expr 或 OCL 子集)。

## 目标
在 mbse manifest 上补**裕度派生**(requirement 的 target/margin_threshold 对其验证 test_result 的 value/verdict)+ **覆盖/失败规则**,使验证状态从"有没有测"升级到"测得过不过、裕度够不够"。

## 现状(已核实)
- mbse manifest:requirement.{target, margin_threshold},test_result.{value, verdict};关系 verified_by(requirement→test_case)、produces(test_case→test_result);已有 verify_status_fx + R-VER-01/02、R-COV-01。
- 表达式引擎支持导航/聚合(traverse/relationCount 等);OCL 子集已接入(lang 缺省 m-expr,既有不变)。

## 范围(声明式,零迁移)
- **A. 裕度派生**(mbse manifest,requirement 上):如 `verify_margin_fx` —— 沿 verified_by→produces 取 test_result.value,与 target±margin_threshold 比较,产出裕度/达标布尔(用现有表达式能力;若需 OCL 子集则 manifest 该表达式标 `lang:"ocl"`,既有派生不动)。
- **B. 覆盖/失败规则**(mbse manifest,requirement 上):
  - 未覆盖:无 verified_by 或无 test_result → WARN。
  - 失败:test_result.verdict=fail 或裕度不达标 → BLOCK/WARN(按语义)。
  - (复用/不破坏现有 R-VER/R-COV;新增的与之并存。)
- **C. 重种 + 校验**:C1 的种子数据上,这些派生/规则**算得出三态对应结果**;DevSeedRunner 规则校验跑通。
- **D. 不改**:表达式引擎语义、其它领域 manifest、迁移、写入语义;**严格按 manifest 既有字段,不杜撰**。

## 封闭文件清单
**修改**:`packages/domains/mbse/profile.manifest.json`(加派生/规则)、必要时 `DevSeedRunner`/E2E 断言裕度/覆盖判定;相关后端 E2E。
**零碰**:表达式引擎实现、其它领域 manifest、迁移、写入语义、前端。

## 红线 / 门禁
- 声明式优先(manifest 派生/规则);**零迁移、零引擎语义变更、零碰其它领域**;新表达式按现有能力或 OCL 子集(既有派生/规则零回归)。
- 字段严格按 manifest;裕度/覆盖在 C1 三态数据上判定正确。
- Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`)。
- 分支 `feat/T-V35-c2-mbse-margin-rules` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡文件;发 `git diff --stat main` + 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 通过态需求:裕度派生达标、无失败规则命中;失败态:失败规则命中(verdict/裕度);未覆盖态:未覆盖规则命中。
2. 既有 verify_status_fx/R-VER/R-COV 零回归;其它领域零回归;verify 全绿 Skipped:0;无迁移 diff。

## 跟进(本卡不做)
C3 覆盖汇总端点(把这些判定按需求集滚动);C4 仪表。
