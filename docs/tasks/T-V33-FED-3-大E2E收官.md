# T-V33-FED-3 — 大 E2E 收官(SysML+M2M+总线+派生+规则一条链)

蓝本:`docs/20` §5。前置全部已在 main:SysML profile(gen/profile)、M2M 转换(fed-2,v1.29)、总线 profile、派生/计算层(der-*)、规则(rule-*)。**纯集成测试卡**:不加生产代码、不动契约/迁移,只新增一个端到端测试,验证"一份数据、多个工程镜头、互引不互拷"。

## 目标

在一个 workspace 里,用**已有命令/端点**贯通:SysML 侧建 Block+Connector → `RunTransformation` 投影成总线 node+link(带 correspondence 回指)→ 总线侧派生 `total_load` → 带宽规则判超。全程经命令入口、读模型查询,验证五个能力域焊成一条链。

## 场景(测试步骤,全部走现有 API)

1. **建 profile(meta-commands,草稿模板版本→发布,或直接 workspace 级,沿用现有 e2e 测试的建型方式)**:
   - SysML 侧:`sysml_block`(字段 `bandwidth` 数值)、关系 `uml_connector`(block→block,语义 carries 信号)。
   - 总线侧:`bus_node`、`bus_link`(字段 `capacity` 数值)、关系 `carries`(node→link 或 link→node,按总线 e2e 既有建模)。
   - correspondence 关系:`realizes`(bus_node→sysml_block,跨 profile,沿用 fed-1)。
   - 总线侧派生字段:`bus_node.total_load` = 经派生/计算层聚合其相连 `bus_link` 的 `capacity`(traverse+sum,沿用 der-b 表达式风格)。
   - 带宽规则:`bus_node` 上 `total_load > <阈值>` → BLOCK/RULE-422(沿用 rule-* DefineRule)。
2. **建源数据(commands)**:2~3 个 `sysml_block`(不同 bandwidth)+ 若干 `uml_connector` 连接它们。
3. **定义转换(DefineTransformation)**:`sysml_block→bus_node`(可不直接映射 capacity,或映射 `capacity = toNumber(field('bandwidth'))` 到 bus_link——按总线建模择一,关键是产生可被 total_load 聚合的链路)、`uml_connector→carries`,correspondenceRelationCode=`realizes`。
4. **执行投影(RunTransformation)**:断言生成的 bus_node/bus_link 数量正确;每个 bus_node 有 `realizes` correspondence 回指对应 sysml_block(用 fed-1 互查端点验证)。
5. **派生**:查 `bus_node.total_load`(派生求值端点/读模型)= 期望聚合值。
6. **规则**:对 total_load 超阈值的 bus_node,触发带宽规则告警(冷路径 check_result 或热路径 BLOCK,沿用 rule-* 既有断言方式);未超的不告警。
7. **幂等**:再次 RunTransformation → 总线对象数量不变(fed-2 幂等已保证,这里顺带断言一次)。

## 封闭文件清单

**新增**
- `packages/server/src/test/java/com/mnext/server/FederationE2EIntegrationTest.java`(一个 `@SpringBootTest` 集成测试;复用现有 e2e 测试的 setup helper 风格)。

**零碰**:全部生产代码、contracts、迁移、kernel、engines、views/web。若测试暴露出某能力缺口需改生产代码——**停,回报**,另开卡修;本卡不夹带生产改动。

## 红线 / 门禁

- 测试只经**现有命令/端点**驱动,不直插库、不新增生产代码/契约。
- AG-504:测试不得用 `sleep`;异步(OutboxRelay→投影)用既有 e2e 的轮询/等待工具(沿用 BusProfileE2EIntegrationTest 的等待方式)。
- `pnpm verify` 全绿 + jacoco ≥0.80;**集成测试 Docker 起、server 测试汇总 Skipped:0**。
- AG-405 落盘防截断自检。完成发 `git diff --stat main`(应仅一个测试文件)+ server 测试汇总(Tests run / Skipped)。

## 验收
- 一个测试方法(或少数几个)端到端跑通步骤 1–7,全部断言通过;
- 断言覆盖:投影数量正确、correspondence 可互查(fed-1)、total_load 聚合值正确(派生)、带宽规则按阈值判超(规则)、二次投影幂等。

## 意义
这是四插件验证愿景的核心实证:SysML 的 block/connector 经声明式 M2M 变成总线图的 node/link,带宽分析在总线镜头里跑——同一份数据、多个工程镜头、互引不互拷。fed-3 通过即联邦三卡(对应/转换/收官)全部落地。
