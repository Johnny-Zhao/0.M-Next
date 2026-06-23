# [已废弃 / SUPERSEDED] T-V33-WEB-P3d

本卡**直接改 core `dimensions.ts`** 加风/光 —— 与"领域必须是可装卸插件"的约束冲突(维度会漏进 core)。

**已被取代为**(决策 B,见 `docs/设计稿-领域插件机制.md`):
- `T-V33-PLUGIN-F4-维度注册表.md`(前端:DimensionRegistry,core 只留注册表+内置)
- `T-V33-PLUGIN-INTERIOR-室内设计首个插件.md`(室内插件经 F4 **注册** 风/光,不改 core)

请勿执行本卡。
