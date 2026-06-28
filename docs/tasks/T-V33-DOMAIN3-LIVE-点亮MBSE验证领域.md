# T-V33-DOMAIN3-LIVE — 点亮第三个领域插件(MBSE / 验证)

**packages/server(DevSeedRunner 种子)为主;领域 manifest 已存在。读写经命令入口,含 install/instantiate。** 前置:main(已含 DOMAIN2-LIVE / PROJECT-LIST-REAL,DevSeedRunner 已是多领域)。
定位:平台已定义 MBSE 领域(`packages/domains/mbse/profile.manifest.json`,templateCode `mbse_verification`,objTypes mission/mission_context/phase/env_condition/capability/requirement/test_case/test_result,派生 requirement_count_fx/required_requirement_min_fx/verify_status_fx,3 规则),但未种数据、未在运行平台里"活"。本卡 dev 种一个 **MBSE Demo** 工作空间,使首页列出**三个不同领域**的项目,验证"一套底座、可装卸多领域 + 完整 V&V 追溯链"。

## 现状(已核实)
- `DevSeedRunner`(@Profile("dev"))现:install 室内 + 技术方案,各种一个 Demo(`11111111-…` / `22222222-…`),并 `runChecksAfterReadModelReady` 跑规则。
- MBSE manifest 齐全但**未 install、未实例化、无种子**。通用视图(图/表/树/属性/矩阵)可渲染任意领域对象,无需领域专属前端。
- 关系链(以 manifest 为准):`occurs_in` phase→mission、`imposes` phase→env_condition、`requires` mission_context→capability、`derives` capability→requirement、`verified_by` requirement→test_case、`produces` test_case→test_result。
- required 字段(以 manifest 为准):mission.name、mission_context.name、env_condition.value、capability.name、requirement.{code,text,target,margin_threshold}、test_case.name、test_result.{value,verdict}。

## 范围
- **A. DevSeedRunner 增点亮 MBSE**(完全参照技术方案的写法):
  1. 读取 `packages/domains/mbse/profile.manifest.json`(沿用现有 `manifestCandidates` 多路径回退),`profileLoader.install(...)`。
  2. `lifecycle.instantiateWorkspace` 一个固定 id 的 "MBSE Demo" 工作空间:**`33333333-3333-4333-8333-333333333333`**(与前两个 demo 不同)。
  3. **种一套最小有效 V&V 链**:1 个 mission(根)→ 1 个 mission_context → 1~2 个 phase(各挂 1 个 env_condition,经 occurs_in/imposes 连接)→ mission_context `requires` 1~2 个 capability → 各 `derives` 1~2 个 requirement → 每个 requirement `verified_by` 1 个 test_case → 部分 test_case `produces` 1 个 test_result(留一两个 requirement **不**接 test_result,使 `verify_status_fx` 有"已验证/未验证"对比、覆盖规则有红/绿判定)。字段填 manifest **required** 项的合理值,使派生算得出、规则有判定。
  4. 幂等:已存在则跳过(参照 `demoFloorplanExists` 思路,按 MBSE 根类型 mission 在该工作空间存在与否判断)。
  5. `runChecksAfterReadModelReady` 增对 MBSE 工作空间跑相应 objectType 的规则校验(参照 `runTechnicalRuleChecks`),并 LOG 一行 "DEV SEED: mbse installed, demo workspace 33333333-… ready"。
- **B. 不改前端**:通用视图 + 真实工作空间列表已能展示;MBSE 无专属维度,**前端零改动**。
- **C. 不改**:写入/命令语义、Flyway 迁移、其它领域、室内/技术方案既有种子。

## 封闭文件清单
**修改**:`packages/server/src/main/java/com/mnext/server/DevSeedRunner.java`;按需补/扩后端 E2E 测试(参照 `DevSeedRunnerIntegrationTest`,断言三领域可查、MBSE 派生/规则有值)。
**零碰**:Flyway 迁移、写入命令语义、前端、室内/技术方案既有种子逻辑、manifest 文件本身。

## 红线 / 门禁
- 仅扩 dev 种子 + 经既有命令 install/instantiate/createObject/createRelation;**零迁移、零写入语义变更**。
- 幂等:重复启动不重复种、不报错;不影响室内/技术方案 Demo。
- 字段/关系严格按 mbse manifest(required 必填、关系类型/方向正确),派生与规则能算出;**不杜撰 manifest 没有的字段/关系**。
- `corepack pnpm verify` 全绿(含后端 E2E);只 add 本卡相关文件。
- 分支 `feat/T-V33-domain3-live` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + 测试汇总。命中红线(尤其需迁移/动写入语义)停下回报,不夹带。

## 验收
1. dev 重置+重起后,日志出现 "DEV SEED: mbse … ready";首页 `/views/workspaces` 列出**三个项目**:室内设计 Demo + 技术方案 Demo + MBSE Demo。
2. 打开 MBSE Demo:图/树/表显示 mission/capability/requirement/test_case 等真实对象;`verify_status_fx`/`requirement_count_fx` 等派生有值;覆盖/验证规则灯按判定显示(已接 test_result 的需求为绿、未接的为红/黄)。
3. 矩阵面板可选 requirement×test_case×verified_by(或 capability×requirement×derives)呈现验证覆盖。
4. 室内/技术方案 Demo 不受影响;verify 全绿(含后端 E2E);无迁移/写入 diff。

## 跟进(本卡不做)
能力市场按行业/专业/场景检索装载(见 MANIFEST-TAGS);领域专属验证视图/覆盖率仪表。
