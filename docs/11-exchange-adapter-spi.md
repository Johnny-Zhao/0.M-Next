# 11 — 交换适配器 SPI + 插件扩展点设计稿(阶段7 收尾)

- 状态:设计稿(Claude 产出,待用户确认 → 转 Codex 任务卡 T-V33-707)
- 依据:702(JSON)/705(ReqIF)已两次重复同一交换骨架;说明书"制品适配器""插件化适配"§9.4、§F.5;AGENTS.md AG-108/110/201/208/507;Backlog BL-01(解释器框架化触发条件)/BL-10/11/12(MBSE/仿真插件)
- 主线:**把双向制品交换从"每格式各写一遍"抽成一个稳定的 `ExchangeAdapter` SPI + 插件注册扩展点**,使 SysML/UAF/DoDAF、FMU 等成为**长在底座之上的适配器插件/库**,而非改内核。这是让"MBSE/仿真插件可被独立开发"的关键一卡。

---

## 1. 动机(为什么现在抽)

702(JSON)与 705(ReqIF)已经把同一条骨架走了两遍:

```
外部文本 → 解析 → 按 key 映射成内部 DataSet → StructuredDiff(vs 快照/current)→ 冲突 → 经 M1 命令回写
DataSet → 序列化 → 外部文本(导出,走快照 AG-208)
```

其中**与格式无关的部分**(diff、apply 编排、快照基准、命令回写、冲突收集)是共享的;**与格式相关的只有两件事**:解析/序列化 + DataSet↔中间模型映射。两个适配器已足够暴露正确抽象(承 BL-01:≥重复骨架即框架化)。再不抽,XMI/SysML 会是第三、第四遍重复,且插件无处可插。

## 2. SPI 形态(落 engines/exchange,纯)

```java
// engines/exchange —— 纯运算,无 Spring/JDBC/命令(AG-108)
public interface ExchangeAdapter {
  String formatId();                 // "json" | "reqif" | "xmi" | "sysml-v1" ...(URL 路径段 + 注册键)
  String mediaType();                // "application/json" | "application/xml" ...
  DataSet importToDataSet(String payload, DataSet current);          // 解析 + 映射(纯)
  String exportFromDataSet(String workspace, String objectType, DataSet dataSet); // 映射 + 序列化(纯)
}
```

- `JsonAdapter` / `ReqIfAdapter`:**重构现有** `ArtifactMapper`/`JsonCodec`、`ReqIfCodec`/`ReqIfMapper` 为该接口的实现(行为不变,仅包装)。
- 适配器**仍是纯运算**:不发命令、不写库、不被 kernel import;diff 与回写不在适配器内。

## 3. 通用端点(server,格式参数化)

把分散的 `/exchange/json/*`、`/exchange/reqif/*` 统一为按 `formatId` 派发:

```
GET  /workspaces/{id}/exchange/{format}/export?base=snapshot:{id}|current&objectType=
POST /workspaces/{id}/exchange/{format}/preview        体=外部文本
POST /workspaces/{id}/exchange/{format}/apply          体=外部文本 + confirmRemovals
```

- 通用 controller 用 `format` 取注册的 `ExchangeAdapter` → 调 `importToDataSet`/`exportFromDataSet`;**apply 编排(diff→发 CreateObject/UpdateFields/CreateRelation、source=artifact_sync、removed 不自动删、KERNEL-409→unapplied)与 export 的快照基准(AG-208)是共享代码,只调一次**。
- **向后兼容**:保留现有 `/exchange/json/*`、`/exchange/reqif/*` 路径(或令其等价于 `{format}=json|reqif`),现有 702/705 测试**必须仍全绿、行为零变**。

## 4. 插件注册(JDK ServiceLoader,零新依赖)

- 适配器经 **JDK `ServiceLoader`** 发现:实现类 + `META-INF/services/com.mnext.engines.exchange.ExchangeAdapter` 条目即被注册。
- **内核侧 JSON/ReqIF 用同一机制注册**(吃自己的狗粮);**外部插件 jar** 放进 classpath 即新增格式,**不改内核一行**。这正是 SysML/UAF/DoDAF/FMU 适配器的插座(BL-10/12)。
- `AdapterRegistry`:按 formatId 索引;未知 format → `KERNEL-400-SCHEMA-INVALID`/404。

## 5. 架构红线(不变)

- 适配器纯(engines/exchange,AG-108);回写经命令入口(AG-110);导出走快照(AG-208);外部文件不作事实源(AG-507);**禁止新增依赖(AG-502)**——ServiceLoader 是 JDK 内置;无新命令/事件 → 无契约门。
- 插件只实现 SPI + (装配时)在 M2 建所需对象/关系类型,**不得碰内核/主数据写路径**。

## 6. 与 706(XMI)的关系

- 707 从 **702+705 两个已有适配器**抽 SPI,**不依赖 706**。
- 抽完后,XMI(706)**改为该 SPI 的一个实现**;它进 core 还是作首个"插件式"参考实现,是**打包选择**——鉴于其终端价值低(见 docs/10/§4 与 2026-06-15 讨论),可作为**验证 SPI 的样例适配器**或直接后置,SysML 才是真正目标(BL-10)。

## 7. 批次切分

| 卡 | 范围 | 依赖 |
|---|---|---|
| **T-V33-707** | `ExchangeAdapter` SPI + `AdapterRegistry`(ServiceLoader)+ JSON/ReqIF 重构为实现 + 通用 `/exchange/{format}/*` 端点(向后兼容)+ 一份"交换适配器插件开发"扩展点说明 | 702/705 |
| 后续(插件,出 core) | SysML v1/UAF/DoDAF 适配器(BL-10)、FMU/仿真(BL-12) | 707 |

## 8. 验收口径

JSON/ReqIF 重构为 SPI 实现后 `pnpm verify` 全绿、**702/705 既有行为与测试零变**;通用端点按 format 派发正确;`ServiceLoader` 能发现一个测试用 `ExchangeAdapter`(证明外部可插);架构断言:适配器无 spring/jdbc/sql/命令。产出"插件开发扩展点"文档(给 BL-10/12 用)。

## 9. 禁止事项

不实现:任何具体 SysML/UAF/DoDAF/FMU 适配器(均属插件,BL-10/12)、元模型联邦/语义对齐(BL-11)、仿真执行(BL-12)、第三方 XML/序列化库、removed 自动删除。不改:StructuredDiff/快照/命令回写的既有语义(仅做包装与参数化)、契约 schema、AGENTS.md、迁移、packages/{views,web}。回写经命令入口(AG-110);外部不作事实源(AG-507);适配器纯(AG-108)。每步一 commit,完成后停止等待审查。
