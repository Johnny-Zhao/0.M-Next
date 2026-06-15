# 13 — SysML 数据互通 + 可执行语义(fUML / PSSM / PSCS)能力路线

- 状态:**路线设计稿**(分层程序,非单卡;待用户确认从 L0 起步)
- 依据:说明书 §7 分析仿真/联合仿真、§7.7 制品适配器、仿真调度器/`SimulationCompleted`、§1134 重任务后台;707 `ExchangeAdapter` SPI / 708 `RenderAdapter` SPI(同构样板);Backlog BL-10(SysML 适配)/BL-11(元模型联邦)/BL-12(仿真能力引擎);AGENTS.md AG-208/AG-110/AG-301/AG-501/AG-502/ADR-008
- 主线:**"SysML + 可执行语义"是底座之上的分层程序**——底座提供脊柱(数据互通 SPI 已有 707;**仿真能力引擎 SPI 待建**);SysML 数据/执行作插件;**fUML/PSSM/PSCS 的执行语义永远由外接引擎实现,平台只编排**(调度/变量映射/检查点/结果/回放)。

---

## 0. 诚实定级(必读)

这**不可能一张卡做完**。它至少是 4 层、横跨核心前置 + 外部引擎集成 + 研究级语义:

| 层 | 内容 | 性质 | 难点/门 |
| --- | --- | --- | --- |
| **L0 仿真能力引擎 SPI**(核心前置) | `SimulationEngine` SPI + 调度(异步任务,§1134)+ 结果存储 + **`SimulationCompleted` 事件** + 回放 | **内核/能力引擎**,所有执行插件的插座 | 新事件 → **契约门(AG-301/501)**;异步任务机制 |
| **L1 SysML 数据互通** | SysML v1 = UML profile + XMI;解析 → 映射 Block/Part/Port/Connector/StateMachine/Requirement → M2 类型 → DataSet | **交换适配器插件**(实现 707 SPI)+ 在 M2 建 SysML 概念 | profile/stereotype 感知;MOF 映射(BL-10/11) |
| **L2 fUML 执行** | 外接 fUML 执行引擎(OMG fUML 参考实现 / Eclipse Papyrus Moka)作 SimulationEngine 插件:喂模型 → 执行 → 结果/轨迹 → SimulationCompleted | **仿真插件 + 外接引擎** | 引擎**许可核对**(Eclipse 系多为 **EPL**,需过 E2/ADR-008)、成熟度、重 |
| **L3 PSSM / PSCS** | 状态机(PSSM)/复合结构(PSCS)可执行语义,**基于 fUML 扩展** | **研究级**,后置 | 参考实现多为研究原型;先有 L2 才谈 L3 |

> 关键:平台**不实现** fUML/PSSM/PSCS 语义——那是外接引擎的事。平台做"喂数据(快照)、调度、收结果、记 SimulationCompleted、回放"。这与 §7、§1271"能力引擎异步执行"一致。

## 1. 底座要补的脊柱:仿真能力引擎 SPI(L0)

仿照 707/708 的 SPI 模式,但**比它们重**(涉事件 + 异步):
```java
public interface SimulationEngine {
  String engineId();                       // "fuml" | "pssm" | "modelica-fmu" ...
  SimResult run(DataSet snapshot, SimConfig config);   // 喂不可变快照(AG-208)→ 结果/轨迹
}
```
- 输入只能是 **snapshotId 对应的不可变快照**(AG-208,复用 704)。
- **新增 `SimulationCompleted` 事件**(载荷:结果哈希、配置快照 id、引擎/版本、耗时、操作者)→ **须走契约 addendum(AG-501)+ 注册(AG-301)**,这是 L0 的契约门(人发起 spec-change)。
- 重任务**异步**(§1134):排队/进度/取消/重试/结果缓存/完成通知;执行不在命令热路径。
- 引擎经 ServiceLoader 注册(同 707);**外接引擎作插件实现该 SPI,不进内核**。

## 2. 依赖 / 许可门(L2 关键)

fUML/PSSM/PSCS 的可用执行引擎多来自 Eclipse(Papyrus Moka、UML2 fUML RI)→ 多为 **EPL**,可能触碰你的 **E2 许可/离线分发**红线。**L2 前必须**:专项 ADR 选引擎 + 许可核对 + allowlist(类比 ADR-010);若 EPL 不可接受,则需找替代引擎或以进程外/服务化方式隔离(避免库级链接)。**此门未过,L2 不开工。**

## 3. 排序与并行

```
L0 仿真能力引擎 SPI(核心,先做;含契约 addendum)
   ├─ L1 SysML XMI 交换适配器(数据互通,可与 L0 并行;实现 707 SPI)
   └─ L2 fUML 执行插件(需 L0 + 引擎许可准入)
         └─ L3 PSSM/PSCS(需 L2;研究级,后置)
```

## 4. 风险

- **引擎许可/成熟度**(L2/L3):EPL/研究原型;选型需 ADR + 实测。
- **MOF/profile 映射复杂**(L1):SysML profile → M2 概念需深建模(BL-11 语义对齐)。
- **执行重**:必须异步任务化,不可同步阻塞主链路。
- **PSSM/PSCS 研究级**:参考实现不一定生产可用;定位为探索,不进 MVP 承诺。

## 5. 卡拆分(建议)

| 卡 | 层 | 前置 |
| --- | --- | --- |
| T-V33-SIM-SPI | L0 仿真能力引擎 SPI + 异步调度 + 结果存储 + SimulationCompleted(含契约 addendum) | 704;人发起 spec-change |
| T-V33-SYSML-XMI | L1 SysML XMI 交换适配器(profile 感知)+ M2 SysML 概念 | 707;BL-10/11 设计 |
| T-V33-FUML-ENGINE | L2 fUML 执行插件 + 外接引擎集成 | L0 + 引擎许可 ADR |
| (后置) | L3 PSSM/PSCS 执行扩展 | L2 |

## 6. 起步建议

**先做 L0(仿真能力引擎 SPI)** —— 它是所有执行插件(fUML/PSSM/Modelica/FMU)的统一插座,与已有 707/708 SPI 模式一致,价值持久;且能先把"快照→调度→SimulationCompleted→结果/回放"的核心闭环立起来(用一个**内置 stub/echo 仿真引擎**验证管线,不引外部重引擎)。L1 SysML 数据适配可并行。L2 fUML 真执行待 L0 + 引擎许可门。

## 7. 禁止事项(横切)

不在核心实现 fUML/PSSM/PSCS 语义(外接引擎);执行引擎未过许可 ADR 前不引(AG-502/ADR-008);仿真输入只接 snapshotId(AG-208);新事件须先过契约门(AG-301/501);执行异步、不进命令热路径;PSSM/PSCS 定位研究、不进 MVP 承诺。
