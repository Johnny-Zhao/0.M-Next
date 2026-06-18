# T-V33-BUS-PROFILE-E2E — 简化总线 profile 端到端(派生+带宽规则)

蓝本:`docs/19`。**验证卡**:用现有能力把总线带宽分析端到端跑通,不新增功能;只在发现集成断点时补最小 glue(server 域)。前置:der-a/b/c + 批2 + 规则全在 main。

## 范围 = docs/19 §1/§2

授权简化总线 profile(`bus_link`{capacity}、`message`{load}、`carries` 关系、派生 `total_load=sum(traverse('carries','out'),'load')`、`margin=capacity-total_load`、非 lightweight 规则 `bandwidth_exceeded: total_load>capacity` BLOCK)→ 发布 → 实例化 → 建链路+消息+carries → RunRuleCheck → 断言带宽违例 + 派生值正确。

## 封闭文件清单

- `packages/server/src/test/.../BusProfileE2EIntegrationTest.java`(Testcontainers)+ 必要时就地最小修(server 域,报告)。
- 零碰 kernel/engines 既有逻辑、views/web、contracts、迁移。

## 断言要点

- total_load=90(2 消息)→ 无违例;加第 3 条 load=30 → total_load=120 > capacity=100 → check_result 出 `bandwidth_exceeded`(message 含 120/100);
- 派生 total_load=120、margin=-20 正确(经查询或检查结果体现);
- 派生随实例化复制进新空间、冷路径规则经 DerivedEvaluator 算 total_load。

## 门禁

`pnpm verify` 全绿 + jacoco ≥0.80;**Docker 起、Skipped:0**(本卡核心是集成测试)。落盘防截断自检。完成停,发 `git diff --stat main` + verify 的 server 测试汇总 + 断点清单。
