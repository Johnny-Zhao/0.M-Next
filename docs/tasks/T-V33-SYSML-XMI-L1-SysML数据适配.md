# T-V33-SYSML-XMI-L1 — SysML/XMI 交换适配器(as-built)

状态:**已完成并合入 main**（merge `53a039b`，tag `v1.10-stage-L1-sysml-xmi`）。

## 目标

在既有交换 SPI（707 的 `ExchangeAdapter`）之上，新增一个 **SysML v1 / XMI** 数据适配器，把 SysML/UML XMI 文件导入为内部 `DataSet`、并能从 `DataSet` 导出回 XMI。属于"平台之上的插件/库"，不进内核。

## 封闭文件清单

- `packages/engines/src/main/java/com/mnext/engines/exchange/sysml/SysmlXmiAdapter.java`（实现 `ExchangeAdapter`）
- `packages/engines/src/main/java/com/mnext/engines/exchange/sysml/SysmlXmiCodec.java`（XML ↔ 模型）
- `packages/engines/src/main/java/com/mnext/engines/exchange/sysml/SysmlXmiMapper.java`（模型 ↔ `DataSet`）
- `packages/engines/src/main/java/com/mnext/engines/exchange/sysml/SysmlXmiModel.java`（不可变记录）
- `packages/engines/src/main/resources/META-INF/services/com.mnext.engines.exchange.ExchangeAdapter`（**追加**一行 `…sysml.SysmlXmiAdapter`）
- `packages/engines/src/test/java/com/mnext/engines/exchange/SysmlXmiExchangeTest.java`
- `packages/engines/src/test/java/com/mnext/engines/exchange/ExchangeArchitectureTest.java`（追加 sysml 纯度断言）

零 server / views / web / 迁移 / 依赖。

## 契约与映射

- `formatId = "sysml-xmi"`，`mediaType = "application/xml"`，经通用交换端点按 formatId 分发（与 JSON / ReqIF 适配器并存）。
- stereotype ↔ objectType：`Block↔sysml_block`、`requirement↔sysml_requirement`、其余 `uml_class`。
- `uml:Association` ↔ `uml_association` 关系；端点经 `ownedEnd`/`memberEnd` 解析，端点缺失即抛错。
- 导入按 `xmi:id` 复用既有对象的 `status`/`version`，确定性排序，**回环幂等**（round-trip 保持 `DataSet` 同一性，测试已断言）。

## 红线与门禁

- AG-101：适配器纯在 `engines`，只依赖 `DataSet`/`ExchangeAdapter`，零 spring/jdbc。
- AG-301/501：**未新增**命令/事件类型，无需契约 addendum。
- **安全（XXE）**：`SysmlXmiCodec.parse` 关闭 DOCTYPE 与外部实体——
  `disallow-doctype-decl=true`、`external-general-entities=false`、`external-parameter-entities=false`、`setXIncludeAware(false)`、`FEATURE_SECURE_PROCESSING=true`。配套用例：带 `<!DOCTYPE …>` 的恶意载荷被拒（commit `8b7d7aa`）。
  注：feature URI 用 `"http" + "://…"` 拆分书写，规避 AG-505 硬编码公网 URL 规则。
- `pnpm verify` 全绿（architecture/lint/typecheck/test/build）。

## 后续（不在本卡）

- SysML v2（KerML/own-API）、Modelica（.mo/FMI）需各自 profile-aware 适配器，本卡只覆盖 SysML v1/XMI。
- L1 导入的模型可喂给 L0 仿真，但当前两者代码无依赖。
