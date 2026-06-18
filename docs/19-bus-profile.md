# 19 — 简化总线 Profile 端到端验证(派生/计算层收获 + 第二个 profile)

状态:**设计稿(待确认)**。目标:用平台已就绪能力(类型/关系/派生/规则/模板/导入)端到端验证**"可配置链式聚合计算 + 约束"在真实工程分析场景**(总线带宽)成立。产出**第二个 profile**(为将来联邦铺路)。**演示性、非私有 schema**(真 1553B/RS422 待你给参数集)。

## 0. 验证链

> 授权简化总线 profile(链路/消息 + carries 关系 + 派生 total_load + 带宽规则)→ 发布 → 实例化 → 建链路+消息+carries → 跑全量检查 → **派生 total_load(沿 carries 聚合)被算出、带宽规则判超限**。

跑通即证明:**派生(跨关系聚合)+ 规则引用派生 + 冷路径检查** 在真实分析场景端到端成立——这是总线带宽、SysML 参数化、Modelica 方程共用的那层能力的实证。

## 1. Profile 内容(简化)

- **对象类型**:`bus_link`(链路,字段 `capacity` number)、`message`(消息,字段 `load` number)。
- **关系类型**:`carries`(bus_link → message,one_to_many),`traverse('carries','out')` 从链路得其承载消息集。
- **派生属性**(bus_link):
  - `total_load = sum(traverse('carries','out'), 'load')`(沿关系聚合);
  - `margin = field('capacity') - field('total_load')`(**嵌套引用派生 + 算术**)。
- **规则**(bus_link,**非 lightweight**——含遍历,走冷路径):`bandwidth_exceeded`:`when = field('total_load') > field('capacity')`,severity=BLOCK(冷路径记 check_result),message=`链路负载 ${field('total_load')} 超带宽 ${field('capacity')}`。

## 2. 端到端验证(集成测试)

1. 授权并发布上述 profile(经真实命令端点:DefineObjectType/FieldDef/RelationType/DefineDerivedField/DefineRule/PublishRule/PublishTemplateVersion)。
2. `InstantiateWorkspace` 建项目空间(类型+派生+规则整套复制进来)。
3. 建 1 条链路(capacity=100)+ 2 条消息(load 40、50)+ 2 条 carries(link→msg)。
4. `RunRuleCheck` → 该链路 total_load=90 ≤ 100,**无带宽违例**。
5. 再加 1 条消息(load 30)+ carries → total_load=120 > 100。`RunRuleCheck` → **check_result 出带宽违例**(message 含 120/100)。
6. **断言**:check_result 含该链路的 `bandwidth_exceeded` 违例;(可选)查询/验证 `total_load`、`margin` 派生值正确(120 / -20)。

## 3. 可能暴露的小缺口(验证副产物,就地最小修 server 域)

- 派生随实例化复制是否把 `total_load`/`margin` 带进新空间(der-c 的 DerivedFieldCopier);
- 冷路径 `RuleCheckRunner` 对**非 lightweight** 规则求值时,`field('total_load')` 是否经 DerivedEvaluator 算出(der-c 接线);
- 发现断点 → server 最小修 + 报告。

## 4. 封闭文件清单(预估)

- `packages/server/src/test/.../BusProfileE2EIntegrationTest.java`(Testcontainers)。
- 若需就地修:对应 server 文件最小改(报告,不碰 kernel/engines 既有逻辑、不新增功能)。

零碰:kernel/engines 既有实现(只调用)、views/web、contracts、迁移。

## 5. 红线 / 门禁

写入经命令入口(AG-110);派生求值只读(AG-105);冷路径无 sleep(AG-504)。`pnpm verify` 全绿 + jacoco ≥0.80;**集成测试 Docker 起、Skipped:0**。完成停,发 `git diff --stat main` + verify 的 server 测试汇总(Skipped 数)+ 发现/修补的断点。

## 6. 后续(不在本卡)

真 1553B/RS422 全保真(你的参数集 + 私有 schema)、时序/余度分析(更多派生+规则)、总线拓扑图谱视图、联邦(总线节点 ↔ SysML Block,需 ≥2 profile + M2M)。
