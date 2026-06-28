# T-V33-DOMAIN2-LIVE — 点亮第二个领域插件(技术方案)

**packages/server(DevSeedRunner 种子)为主;领域 manifest 已存在。读写经命令入口,可能含一次 install/instantiate。** 前置:main(已含 DEV-SEED / PROJECT-LIST-REAL)。
定位:平台已定义"技术方案"领域(`packages/domains/technical-proposal/profile.manifest.json`,objTypes proposal/system/module/interface/requirement,派生 child_count_fx,3 规则),但未种数据、未在运行平台里"活"。本卡 dev 种一个**技术方案 Demo** 工作空间,使首页列出**两个不同领域**的项目,验证"一套底座、可装卸多领域"。

## 现状(已核实)
- `DevSeedRunner`(@Profile("dev"))现仅:install 室内 profile + 种"室内设计 Demo"(workspace `11111111-…`)。
- 技术方案 manifest 齐全但**未 install、未实例化、无种子**;通用视图(图/表/树/属性)可渲染任意领域对象(无需领域专属前端)。
- 工作空间列表 `/views/workspaces`(PROJECT-LIST-REAL)已能列出真实工作空间。

## 范围
- **A. DevSeedRunner 增点亮技术方案**(参照现有室内的写法):
  1. 读取 `packages/domains/technical-proposal/profile.manifest.json`(沿用现有 manifestCandidates 风格的多路径回退),`profileLoader.install(...)`。
  2. `instantiateWorkspace` 一个固定 id 的"技术方案 Demo"工作空间(如 `22222222-2222-4222-8222-222222222222`,与室内 demo 不同)。
  3. **种一套最小有效样例**:1 个 proposal(根)→ 2~3 个 system → 各挂 module、1 个 interface、若干 requirement;按 manifest 的**关系类型**(如 contains/depends/satisfies,以 manifest 实际为准)连接;字段填 manifest **required** 项的合理值,使 `child_count_fx` 等派生算得出、规则有判定。
  4. 幂等:已存在则跳过(参照 `demoFloorplanExists` 思路,按该领域根类型判断)。
- **B. 不改前端**:通用视图 + 真实工作空间列表已能展示;若该领域无专属维度(technical-proposal 无 src dimensions),**前端零改动**。
- **C. 不改**:写入/命令语义、迁移、其它领域、室内种子。

## 封闭文件清单
**修改**:`packages/server/src/main/java/com/mnext/server/DevSeedRunner.java`;按需补后端 E2E 测试(种子/多领域可查)。
**零碰**:Flyway 迁移、写入命令语义、前端(除非确需,且零契约)、室内既有种子逻辑。

## 红线 / 门禁
- 仅扩 dev 种子 + 经既有命令 install/instantiate/createObject/createRelation;**零迁移、零写入语义变更**。
- 幂等:重复启动不重复种、不报错;不影响室内 Demo。
- 字段/关系严格按 technical-proposal manifest(required 必填、关系类型/方向正确),派生与规则能算出;**不杜撰 manifest 没有的字段**。
- `corepack pnpm verify` 全绿(含后端 E2E);只 add 本卡相关文件。
- 分支 `feat/T-V33-domain2-live` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + 测试汇总。命中红线(尤其需迁移/动写入语义)停下回报,不夹带。

## 验收
1. dev 重置+重起后,日志出现技术方案 Demo 就绪;首页 `/views/workspaces` 列出**两个项目**:室内设计 Demo + 技术方案 Demo。
2. 打开技术方案 Demo:图/树/表显示 proposal/system/module/requirement 等真实对象;`child_count_fx` 等派生有值;规则灯按判定显示。
3. 室内 Demo 不受影响、照常;verify 全绿(含后端 E2E);无迁移/写入 diff。

## 跟进(本卡不做)
MBSE 领域同法点亮;领域专属视图;能力市场按行业/专业/场景检索装载。
