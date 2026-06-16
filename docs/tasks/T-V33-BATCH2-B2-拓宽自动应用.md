# T-V33-BATCH2-B2 — 拓宽演化自动应用(对齐设计稿验收)

蓝本:`docs/16` §4。前置:batch2-b 已在 main(当前仅"枚举值新增"自动应用,余皆阻断)。**kernel 域**,纯行为增强,**无契约/错误码/迁移变更**。

## 目标

把 `ApplyTemplateVersion` 判级中**真正零风险的新增**从 blocking 改为**自动应用**,让"安全自动升级"名副其实(对齐设计稿 §8 "仅加可选字段→自动应用成功")。

## 自动应用集(由 blocking 移入 additive,逐项)

| 改动 | 现状 | 改为 | 安全理由 |
|---|---|---|---|
| 新对象类型 / 值类型 / 关系类型 | blocking | **自动** | 无存量实例,纯增 |
| 新增子类型(带 parent 的新对象类型) | blocking | **自动** | 同上 |
| 既有类型上新增**可选**字段 | blocking | **自动** | 存量实例缺该字段对可选字段合法 |
| **放宽**约束(maxLength↑ / minLength↓ / min↓ / max↑ / 枚举超集) | blocking | **自动** | 旧值在更松约束下仍合法 |
| 枚举值新增 | 已自动 | 自动 | — |

## 仍阻断(不动,继续 blocking + 受影响扫描)

新增**必填**字段;**收紧**约束;删字段/类型;删有引用枚举值;改 data_type;**改父类型**;**重定义/值类型改为非子孙**(gen-d 维度全部保持阻断)。

## 实现要点

- **判级**:`compareExistingField` 把约束变更拆成"放宽 vs 收紧"(复用协变比较判方向)——放宽→additive,收紧→blocking;`compareFieldDefs` 新可选字段→additive、新必填→blocking;`compareObjectTypes`/`compareValueTypes`/`compareRelationTypes` 的"新增"→additive。
- **应用**:扩 `applyTemplateVersion`,对 additive 项把新定义**插入本空间类型副本**,跨引用**按 code 解析到本空间已有副本**(新字段的 value_type_id→本空间同 code 值类型;新子类型的 parent_type_id→本空间同 code 父类型;新关系 source/target→本空间同 code 类型)。新类型/值类型若自带 parent 链,递归按 code 解析。
- **一处不变**:任一 blocking 项存在 → 整体仍 `KERNEL-409-TEMPLATE-MIGRATION-REQUIRED`(混合时不部分应用,全或无)。

## 封闭文件清单

- `packages/kernel/src/main/java/com/mnext/kernel/internal/MetaModelRepository.java`(扩 `ApplyPlan` 结构 + compare*/applyTemplateVersion)、必要时 `ApplyTemplateVersionHandler`(若 plan 结构变)。
- 测试:`MetaModelIntegrationTest` 增——新可选字段自动应用成功(本空间副本真的多了该字段,CreateObject 可用);新类型/子类型/放宽约束自动;**新必填/收紧/改父类型仍阻断**;混合(含一个收紧)→整体阻断不部分应用。

零碰:engines、views/web、contracts、迁移、rule_def、server(除非 plan 类型签名外溢到 controller)、Simulation*。

## 红线 / 门禁

- AG-201:判级只读 + 自动应用同一事务、全或无、失败回滚;AG-105 扫描只读;自动应用只动本空间副本、跨引用按 code 解析闭合(无悬空 FK、不跨空间)。
- `pnpm verify` 全绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,发 `git diff --stat main` + verify 结尾。
