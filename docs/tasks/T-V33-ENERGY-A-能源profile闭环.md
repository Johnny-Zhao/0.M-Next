# T-V33-ENERGY-A — 能源分系统 profile 阶段A 建型与闭环 e2e

蓝本:`docs/能源分系统-profile草案.md`(阶段A 标量闭环)。前置全部已在 main:M2 元模型/泛化/值类型、派生/计算层、规则、关系。**纯 server e2e 测试卡**:零生产代码、零契约、零迁移,只新增一个集成测试,经现有命令/端点建 profile 并断言闭环复算与报警。**与 fed-3(不同测试文件)、interp(engines)三方零文件冲突**;阶段A 中 DOD/衰减作输入字段,**不依赖 interp 分支**。

## 目标

在一个 workspace 里用 meta-commands 建"能源分系统"profile,建一组样例方案数据,断言:输入→标量核算→裕度/可靠度→报警 的闭环成立,且**改一处选型后派生全部重算**。实证可行性备忘的"阶段A"。

## 范围(全部走现有命令/端点)

按草案建型(可用代表性子集控制测试体量,但必须覆盖下列闭环要素):

1. **值类型/对象类型/字段**:mission_orbit、operating_mode、load_item、solar_array、battery_pack、bus_pcdu;产品库基类 `product_item` + **至少 2 个泛化子类**(如 solar_cell、battery_cell,验证泛化/重定义)。单位用 value_type(power_w/energy_wh/mass_kg/area_m2/ratio/cost_cny)。
2. **关系**:mode_has_load、powers_bus/feeds、selected_as(选型)、redundant_with(冗余/RBD)。
3. **派生字段(仅阶段A `[A]` 项,草案 §2/§4)**:
   - operating_mode.sunlight_power_w / eclipse_power_w = 按 phase 聚合 mode_has_load 负载功率;
   - solar_array.area_m2 = required_power_eol_w /(常数×效率×填充×(1-衰减)×温度因子);衰减/温度因子**作输入字段**(阶段A);
   - battery_pack.required_energy_wh / capacity_wh(用 eclipse_min、dod_limit 等**输入字段**);
   - system 级 mass_total / cost_total = 沿 selected_as 聚合;
   - power_margin / energy_margin;
   - 可靠度串/并(并联用 redundant_with;`exp` 若 DSL 无→用近似或作输入,标注即可)。
4. **规则**:power_margin<0.10 告警;energy_margin<0 BLOCK;dod 超限违规(草案 §5 任取 3 条)。
5. **样例数据 + 断言(草案 §6 闭环)**:建 1 轨道 + 2~3 负载 + 各设计槽选型 → 查派生(面积/容量/质量/成本/裕度/可靠度)= 期望值;**换一个电池片选型 → 相关派生重算变化**;构造一个裕度跌破阈值的场景 → 规则告警触发,未跌破的不触发。

## 封闭文件清单

**新增**
- `packages/server/src/test/java/com/mnext/server/EnergyProfileE2EIntegrationTest.java`(一个 `@SpringBootTest` 集成测试,复用现有 e2e 的 setup/await 风格,如 BusProfileE2EIntegrationTest)。

**零碰**:全部生产代码、contracts、迁移、kernel、engines、views/web;**不得修改任何共享测试工具**(只新增本测试文件,helper 用复制而非改公共类)。

**模板骨架例外(2026-06-19 放宽,因 e2e 暴露缺口)**:当前**无创建模板的 API**(模板创作链缺 CreateTemplate/Version 端点,见 T-V33-TPL-API),故**允许**像 `BusProfileE2EIntegrationTest` 一样,在测试内用 JdbcTemplate **仅**创建 `scene_template`/`scene_template_version` 空骨架并 patch `relation_type.template_version_id`——这是既有 e2e 通行的测试脚手架,非产品写路径。**除此之外**所有建型/字段/关系/派生/规则/业务数据/规则检查仍**必须走端点**。待 TPL-API 合入后,本测试应改为纯端点、删除该 SQL 脚手架。

## 红线 / 门禁

- 只经现有命令/端点驱动(meta-commands 建型/发布、commands 建对象/关系、DefineDerivedField、DefineRule、派生求值/规则查询端点);不直插库、不加生产代码/契约。
- AG-504:不得 `sleep`;异步(投影)用既有 e2e 的轮询/await 工具。
- `pnpm verify` 全绿 + jacoco ≥0.80;**集成测试 Docker 起、server 测试汇总 Skipped:0**。
- AG-405 落盘防截断自检。完成发 `git diff --stat main`(应仅一个测试文件 + 本卡 md)+ server 测试汇总。
- 若建型/派生暴露能力缺口需改生产代码——**停,回报**,另开卡;本卡不夹带生产改动。

## 验收
- 闭环 e2e 跑通:建型→样例→派生核算值正确→改选型触发重算→规则按阈值报警;
- 泛化子类被实际使用(产品库 ≥2 子类);
- 全程 profile 配置 + 派生 + 规则,无生产代码改动。

## 用途回链
这是能源工具阶段A 的可行性实证;通过即证明"统一底座 → 定制成能源分系统正向设计工具内核"成立。后续:阶段B 接 interp/SOC/推荐算子,阶段C 做产品 UI。
